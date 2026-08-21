import * as XLSX from 'xlsx';
import type {
  Audit,
  AuditRecord,
  EffectiveTagAssignment,
  ImportIssue,
  ImportPreview,
  KnownIssue,
  RecordStatus,
  SmartTagPattern,
  TagAssignment,
  TagValidationStatus
} from '../types/domain';
import { fieldDecisionLabel, knownIssueActionLabel, knownIssueLabel, operationalActionLabel, statusLabel } from './audit-labels';
import { deriveReconciliation, hasPhysicalEvidence, isConfirmedEvidence, type ReconciledTagState } from './reconciliation';

const REQUIRED_HEADERS = ['Numero de tag', 'Animal'];
const DEFAULT_PATTERN: SmartTagPattern = { prefix: '9840000', length: 15, numericOnly: true };
const PREFIX_LENGTH = 7;

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const result = String(value).trim();
  return result.length ? result : null;
}

function normalizeHeader(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function normalizeTag(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  const digitsOnly = raw.replace(/[^0-9]/g, '');
  return digitsOnly || raw;
}

function getValue(row: Record<string, unknown>, wantedHeader: string) {
  const wanted = normalizeHeader(wantedHeader);
  const key = Object.keys(row).find((candidate) => normalizeHeader(candidate) === wanted);
  return key ? row[key] : null;
}

function blank(value: string | number | null | undefined) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('pt-BR');
}

function mode(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
}

function inferPattern(tags: string[]): SmartTagPattern {
  const numericTags = tags.filter((tag) => /^\d+$/.test(tag));
  const length = Number(mode(numericTags.map((tag) => String(tag.length)))) || DEFAULT_PATTERN.length;
  const sameLength = numericTags.filter((tag) => tag.length === length);
  const prefix = mode(sameLength.map((tag) => tag.slice(0, PREFIX_LENGTH))) ?? DEFAULT_PATTERN.prefix;
  return { prefix, length, numericOnly: true };
}

export function validateSmartTag(tagNumber: string | null, pattern: SmartTagPattern): { status: TagValidationStatus; reason: string } {
  if (!tagNumber) return { status: 'invalid_tag', reason: 'Tag vazia ou ausente.' };
  if (pattern.numericOnly && !/^\d+$/.test(tagNumber)) {
    return { status: 'invalid_tag', reason: 'Tag contem caracteres nao numericos.' };
  }
  if (tagNumber.length !== pattern.length) {
    return { status: 'invalid_tag', reason: `Tag possui ${tagNumber.length} digitos; esperado ${pattern.length}.` };
  }
  if (pattern.prefix && !tagNumber.startsWith(pattern.prefix)) {
    return { status: 'suspicious_tag', reason: `Prefixo diferente do padrao ${pattern.prefix}.` };
  }
  return { status: 'valid_tag', reason: 'Tag dentro do padrao confirmado.' };
}

export async function parseNedapWorkbook(file: File, patternOverride?: SmartTagPattern): Promise<ImportPreview> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', raw: false, cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  if (!sheet) {
    throw new Error('A planilha nao possui nenhuma aba legivel.');
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: false
  });

  if (!rows.length) {
    throw new Error('A planilha esta vazia.');
  }

  const headers = Object.keys(rows[0]).map(normalizeHeader);
  for (const required of REQUIRED_HEADERS) {
    if (!headers.includes(normalizeHeader(required))) {
      throw new Error(`Coluna obrigatoria nao encontrada: ${required}`);
    }
  }

  const issues: ImportPreview['issues'] = [];
  const rawItems: Omit<TagAssignment, 'id' | 'auditId'>[] = [];

  for (const row of rows) {
    const tagNumber = normalizeTag(getValue(row, 'Numero de tag'));
    if (!tagNumber) {
      issues.push({
        type: 'invalid_tag',
        tagNumber: null,
        animal: text(getValue(row, 'Animal')),
        detail: 'Linha sem numero de SmartTag.'
      });
      continue;
    }

    rawItems.push({
      tagNumber,
      functionName: text(getValue(row, 'Funcao')),
      typeName: text(getValue(row, 'Tipo')),
      expectedAnimal: text(getValue(row, 'Animal')),
      connectedSince: text(getValue(row, 'Conectado desde')),
      lastDetectedAt: text(getValue(row, 'Ultimo detetado')),
      lastDetectedFarm: text(getValue(row, 'Detectado pela ultima vez na fazenda')),
      validationStatus: 'valid_tag',
      validationReason: null
    });
  }

  const pattern = patternOverride ?? inferPattern(rawItems.map((item) => item.tagNumber));
  const assignments = rawItems.map((item) => {
    const validation = validateSmartTag(item.tagNumber, pattern);
    return {
      ...item,
      validationStatus: validation.status,
      validationReason: validation.reason
    };
  });

  const tagMap = new Map<string, number>();
  const animalMap = new Map<string, Set<string>>();

  for (const item of assignments) {
    tagMap.set(item.tagNumber, (tagMap.get(item.tagNumber) ?? 0) + 1);

    if (item.validationStatus === 'suspicious_tag') {
      issues.push({
        type: 'suspicious_tag',
        tagNumber: item.tagNumber,
        animal: item.expectedAnimal,
        detail: `${item.validationReason} Animal Nedap: ${item.expectedAnimal ?? 'sem vinculo'}.`
      });
    }

    if (item.validationStatus === 'invalid_tag') {
      issues.push({
        type: 'invalid_tag',
        tagNumber: item.tagNumber,
        animal: item.expectedAnimal,
        detail: `${item.validationReason} Animal Nedap: ${item.expectedAnimal ?? 'sem vinculo'}.`
      });
    }

    if (!item.expectedAnimal) {
      issues.push({
        type: 'tag_without_animal',
        tagNumber: item.tagNumber,
        animal: null,
        detail: `Tag ${item.tagNumber} sem animal vinculado.`
      });
    } else {
      const tags = animalMap.get(item.expectedAnimal) ?? new Set<string>();
      tags.add(item.tagNumber);
      animalMap.set(item.expectedAnimal, tags);
    }
  }

  for (const [tagNumber, count] of tagMap) {
    if (count > 1) {
      issues.push({
        type: 'duplicate_tag',
        tagNumber,
        animal: null,
        detail: `Tag ${tagNumber} aparece ${count} vezes na planilha.`
      });
    }
  }

  for (const [animal, tags] of animalMap) {
    const uniqueTags = [...tags];
    if (uniqueTags.length > 1) {
      issues.push({
        type: 'multiple_tags_same_animal',
        tagNumber: null,
        animal,
        detail: `Animal ${animal} possui ${uniqueTags.length} tags diferentes: ${uniqueTags.join(' e ')}.`
      });
    }
  }

  const validTags = assignments.filter((item) => item.validationStatus === 'valid_tag');
  const validSuffixes = new Set(validTags.map((item) => item.tagNumber.slice(PREFIX_LENGTH)));

  for (const item of assignments.filter((assignment) => assignment.validationStatus === 'suspicious_tag')) {
    if (item.tagNumber.length === pattern.length && validSuffixes.has(item.tagNumber.slice(PREFIX_LENGTH))) {
      issues.push({
        type: 'possible_typo',
        tagNumber: item.tagNumber,
        animal: item.expectedAnimal,
        detail: `Possivel erro de prefixo no cadastro. A tag tem o mesmo final de uma SmartTag valida, mas usa prefixo diferente de ${pattern.prefix}.`
      });
    }
  }

  return {
    assignments,
    issues,
    stats: {
      totalRows: rows.length,
      totalTags: validTags.length,
      validTags: validTags.length,
      suspiciousTags: assignments.filter((item) => item.validationStatus === 'suspicious_tag').length,
      invalidTags: assignments.filter((item) => item.validationStatus === 'invalid_tag').length,
      linkedTags: validTags.filter((item) => Boolean(item.expectedAnimal)).length,
      tagsWithoutAnimal: issues.filter((item) => item.type === 'tag_without_animal').length,
      duplicateTags: issues.filter((item) => item.type === 'duplicate_tag').length,
      animalsWithMultipleTags: issues.filter((item) => item.type === 'multiple_tags_same_animal').length
    },
    pattern
  };
}

function chronological(records: AuditRecord[]) {
  return [...records].sort((a, b) => {
    const sequenceDiff = (a.sequence ?? Number.MAX_SAFE_INTEGER) - (b.sequence ?? Number.MAX_SAFE_INTEGER);
    if (sequenceDiff !== 0) return sequenceDiff;
    return a.scannedAt.localeCompare(b.scannedAt);
  });
}

function countStatus(records: AuditRecord[], status: RecordStatus) {
  return records.filter((record) => record.status === status).length;
}

function countPairs(records: AuditRecord[], status: RecordStatus) {
  const pairIds = new Set(records.filter((record) => record.status === status && record.pairId).map((record) => record.pairId));
  return pairIds.size || countStatus(records, status);
}

function percent(done: number, total: number) {
  return total ? `${Math.min(Math.round((done / total) * 100), 100)}%` : '0%';
}

type SheetValue = string | number;
type SheetRows = SheetValue[][];
type ResultTone = 'success' | 'action' | 'swap' | 'warning' | 'danger' | 'neutral';

type ReportMetrics = {
  totalValid: number;
  baseResolvedCount: number;
  basePhysicallyFoundCount: number;
  baseNotLocatedCount: number;
  newTagsCount: number;
  correctCount: number;
  actionCount: number;
  reviewCount: number;
  animalsWithoutConfirmedTag: number;
};

type ResultFinalRow = {
  status: string;
  smartTag: string;
  animalNedap: string;
  animalCampo: string;
  resultado: string;
  acaoNoNedap: string;
  alerta: string;
  ultimaConfirmacao: string;
  tone: ResultTone;
};

type StyledCell = XLSX.CellObject & { s?: Record<string, unknown> };

function mergeCellStyle(cell: XLSX.CellObject | undefined, style: Record<string, unknown>) {
  if (!cell) return;
  const styled = cell as StyledCell;
  styled.s = {
    ...(styled.s ?? {}),
    ...style
  };
}

function asTextCell(cell: XLSX.CellObject | undefined) {
  if (!cell || cell.v === undefined || cell.v === null || cell.v === '') return;
  cell.t = 's';
  cell.z = '@';
  cell.v = String(cell.v);
}

function containsSmartTagValue(value: SheetValue | undefined) {
  return /\d{12,}/.test(String(value ?? ''));
}

function appendSheet(workbook: XLSX.WorkBook, rows: SheetRows, name: string, options: { tableHeader?: string[]; freezeAtRow?: number; textColumns?: string[]; statusColors?: boolean } = {}) {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  applyWorksheetPresentation(sheet, rows, options);
  XLSX.utils.book_append_sheet(workbook, sheet, name);
}

function applyWorksheetPresentation(sheet: XLSX.WorkSheet, rows: SheetRows, options: { tableHeader?: string[]; freezeAtRow?: number; textColumns?: string[]; statusColors?: boolean }) {
  if (!rows.length) return;
  const columnCount = Math.max(...rows.map((row) => row.length));
  sheet['!cols'] = Array.from({ length: columnCount }, (_, columnIndex) => {
    const width = Math.min(
      Math.max(
        ...rows.map((row) => String(row[columnIndex] ?? '').length),
        10
      ) + 2,
      columnIndex === 6 ? 58 : columnIndex === 1 ? 38 : 34
    );
    return { wch: width };
  });
  sheet['!rows'] = rows.map((row, index) => ({
    hpt: index === 0 && String(row[0] ?? '').startsWith('BIPTAG') ? 24 : undefined
  }));

  const headerIndex = options.tableHeader
    ? rows.findIndex((row) => options.tableHeader!.every((header, index) => row[index] === header))
    : rows.findIndex((row) => row.length > 1);

  if (headerIndex >= 0) {
    const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1:A1');
    sheet['!autofilter'] = {
      ref: XLSX.utils.encode_range({ s: { r: headerIndex, c: 0 }, e: { r: Math.max(range.e.r, headerIndex), c: range.e.c } })
    };
  }

  const freezeAtRow = options.freezeAtRow ?? (headerIndex >= 0 ? headerIndex + 1 : undefined);
  if (freezeAtRow !== undefined) {
    (sheet as XLSX.WorkSheet & { '!freeze'?: unknown })['!freeze'] = { xSplit: 0, ySplit: freezeAtRow };
    sheet['!views'] = [{ state: 'frozen', ySplit: freezeAtRow }];
  }

  const textColumnNames = new Set(options.textColumns ?? ['SMARTTAG', 'TAG']);
  const headers = headerIndex >= 0 ? rows[headerIndex] : [];
  const textColumnIndexes = headers
    .map((header, index) => {
      const headerText = String(header).toUpperCase();
      return textColumnNames.has(String(header)) || headerText.includes('SMARTTAG') || headerText === 'TAG' || headerText.includes('TAG ORIGINAL') ? index : -1;
    })
    .filter((index) => index >= 0);

  const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1:A1');
  for (let rowIndex = 0; rowIndex <= range.e.r; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    for (let columnIndex = 0; columnIndex <= range.e.c; columnIndex += 1) {
      const cellRef = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
      const cell = sheet[cellRef];
      if (!cell) continue;
      if (textColumnIndexes.includes(columnIndex) || containsSmartTagValue(row[columnIndex])) {
        asTextCell(cell);
      }
      mergeCellStyle(cell, {
        border: {
          top: { style: 'thin', color: { rgb: 'E0D6CA' } },
          right: { style: 'thin', color: { rgb: 'E0D6CA' } },
          bottom: { style: 'thin', color: { rgb: 'E0D6CA' } },
          left: { style: 'thin', color: { rgb: 'E0D6CA' } }
        },
        alignment: { vertical: 'top', wrapText: true }
      });
    }
  }

  for (let rowIndex = Math.max(headerIndex + 1, 0); rowIndex < rows.length; rowIndex += 1) {
    for (const columnIndex of textColumnIndexes) {
      const cellRef = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
      asTextCell(sheet[cellRef]);
    }
  }

  if (String(rows[0]?.[0] ?? '').startsWith('BIPTAG')) {
    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: columnIndex });
      const cell = sheet[cellRef];
      if (!cell && columnIndex > 0) continue;
      mergeCellStyle(cell, {
        fill: { patternType: 'solid', fgColor: { rgb: '2D2620' } },
        font: { bold: true, color: { rgb: 'FFFFFF' }, sz: columnIndex === 0 ? 15 : 11 },
        alignment: { vertical: 'center', wrapText: true }
      });
    }
  }

  if (headerIndex >= 0) {
    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
      const cellRef = XLSX.utils.encode_cell({ r: headerIndex, c: columnIndex });
      mergeCellStyle(sheet[cellRef], {
        fill: { patternType: 'solid', fgColor: { rgb: '8F4425' } },
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        alignment: { vertical: 'center', wrapText: true }
      });
    }
  }

  if (options.statusColors && headerIndex >= 0) {
    const statusColumnIndex = headers.findIndex((header) => header === 'STATUS' || header === 'ACAO' || header === 'TIPO');
    if (statusColumnIndex >= 0) {
      for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
        const status = String(rows[rowIndex]?.[statusColumnIndex] ?? '');
        const fill = statusFillColor(status);
        if (!fill) continue;
        for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
          const cellRef = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
          const cell = sheet[cellRef];
          if (!cell) continue;
          mergeCellStyle(cell, {
            fill: { patternType: 'solid', fgColor: { rgb: fill } },
            alignment: { vertical: 'top', wrapText: true }
          });
        }
      }
    }
  }
}

function statusFillColor(status: string) {
  if (['CORRETA'].includes(status)) return 'E5F4EC';
  if (['MOVER', 'VINCULAR', 'NOVA', 'SUBSTITUIR', 'CADASTRAR TAG', 'VINCULAR TAG', 'MOVER TAG', 'SUBSTITUIR TAG'].includes(status)) return 'E8F0F7';
  if (['TROCA', 'TROCAR TAGS', 'POSSIVEL ERRO CADASTRO', 'CADASTRO SUSPEITO', 'CORRIGIR NUMERO DA TAG'].includes(status)) return 'F8E8D8';
  if (['SEM ANIMAL', 'TAG FORA DE USO', 'REMOVER VINCULO', 'CADASTRO INVALIDO', 'MARCAR TAG FORA DE USO'].includes(status)) return 'F8E1DE';
  if (['ANIMAL SEM BRINCO', 'TAG NAO LOCALIZADA', 'ALERTA', 'PROBLEMA CONHECIDO', 'PENDENCIA', 'NAO CONFIRMADA', 'VERIFICAR NAO LOCALIZADA'].includes(status)) return 'FFF0C2';
  return '';
}

function effectiveStatusLabel(status: EffectiveTagAssignment['status']) {
  const labels: Record<EffectiveTagAssignment['status'], string> = {
    pending: 'Pendente',
    confirmed: 'Confirmada',
    reassigned: 'Reatribuida',
    linked: 'Vinculada em campo',
    new_tag: 'Nova tag',
    without_animal: 'Sem animal',
    displaced: 'Deslocada',
    not_found: 'Nao localizada',
    suspicious: 'Suspeita na base',
    invalid: 'Invalida na base',
    unresolved: 'Nao resolvida'
  };
  return labels[status];
}

function actionForEffectiveStatus(status: EffectiveTagAssignment['status']) {
  const actions: Record<EffectiveTagAssignment['status'], string> = {
    pending: 'Localizar SmartTag ou marcar como nao localizada',
    confirmed: 'MANTER TAG',
    reassigned: 'MOVER TAG',
    linked: 'VINCULAR TAG',
    new_tag: 'CADASTRAR TAG',
    without_animal: 'REMOVER VINCULO',
    displaced: 'ANIMAL SEM TAG',
    not_found: 'TAG NAO LOCALIZADA',
    suspicious: 'CADASTRO SUSPEITO',
    invalid: 'CADASTRO INVALIDO',
    unresolved: 'REVISAR OCORRENCIA'
  };
  return actions[status];
}

function actionNeeded(record: AuditRecord) {
  if (record.operationalAction) return operationalActionLabel(record.operationalAction);
  if (record.status === 'possible_swap') return 'TROCAR TAGS';
  if (record.status === 'tag_stored') return 'TAG SEM ANIMAL';
  if (record.status === 'animal_without_ear_tag') return 'ANIMAL SEM BRINCO';
  if (record.status === 'new_tag') return 'CADASTRAR TAG';
  if (record.status === 'linked' || record.status === 'tag_without_animal') return 'VINCULAR TAG';
  if (record.status === 'correct') return 'MANTER TAG';
  return 'INVESTIGAR';
}

function nedapInstruction(record: AuditRecord) {
  if (record.operationalAction === 'remove_tag') {
    return `Remover vinculo da tag ${record.tagNumber} no animal ${record.observedAnimal ?? record.expectedAnimal ?? ''}.`;
  }
  if (record.operationalAction === 'replace_tag') {
    return `Substituir tag do animal ${record.observedAnimal ?? record.expectedAnimal ?? ''}. Tag antiga: ${record.tagNumber}. Tag nova: definir apos revisao.`;
  }
  if (record.operationalAction === 'move_tag') {
    return `Remover vinculo do animal ${record.expectedAnimal ?? ''} e vincular tag ${record.tagNumber} ao animal ${record.observedAnimal ?? ''}.`;
  }
  if (record.operationalAction === 'tag_out_of_use') {
    return `Marcar tag ${record.tagNumber} como fora de uso.`;
  }
  if (record.operationalAction === 'keep_tag') {
    return `Manter tag atual no animal ${record.observedAnimal ?? record.expectedAnimal ?? ''}.`;
  }
  if (record.operationalAction === 'swap_tags' || record.status === 'possible_swap') {
    return `Trocar vinculos entre animais ${record.expectedAnimal ?? ''} e ${record.observedAnimal ?? ''}.`;
  }
  if (record.status === 'new_tag' || record.operationalAction === 'register_new_tag') {
    return `Cadastrar tag ${record.tagNumber} no animal ${record.observedAnimal ?? ''}.`;
  }
  if (record.status === 'linked' || record.operationalAction === 'link_tag') {
    return `Vincular tag ${record.tagNumber} ao animal ${record.observedAnimal ?? ''}.`;
  }
  if (record.status === 'audit_conflict' || record.status === 'new_tag_conflict' || record.operationalAction === 'investigate') {
    return 'Investigar ocorrencia antes de alterar o Nedap.';
  }
  return 'Revisar antes de executar no Nedap.';
}

function actionPriority(record: AuditRecord) {
  if (record.status === 'audit_conflict' || record.status === 'new_tag_conflict') return 'Alta';
  if (record.status === 'unconfirmed' || record.status === 'tag_not_found') return 'Alta';
  if (record.operationalAction === 'remove_tag' || record.operationalAction === 'tag_out_of_use') return 'Alta';
  if (record.operationalAction === 'investigate') return 'Alta';
  if (record.operationalAction === 'keep_tag') return 'Baixa';
  return 'Media';
}

function effectivePriority(status: EffectiveTagAssignment['status']) {
  if (status === 'displaced' || status === 'not_found' || status === 'unresolved') return 'Alta';
  if (status === 'pending') return 'Media';
  return 'Baixa';
}

function knownIssuePriority(issue: KnownIssue) {
  if (issue.type === 'tag_out_of_use' || issue.type === 'never_sent_data' || issue.type === 'stopped_sending') return 'Alta';
  return 'Media';
}

function groupByTag<T extends { tagNumber: string }>(items: T[]) {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    grouped.set(item.tagNumber, [...(grouped.get(item.tagNumber) ?? []), item]);
  }
  return grouped;
}

function latestCurrentByStatus(records: AuditRecord[], status: RecordStatus) {
  const byTag = new Map<string, AuditRecord>();
  for (const record of chronological(records).filter((item) => item.isCurrent !== false && item.status === status)) {
    byTag.set(record.tagNumber, record);
  }
  return byTag;
}

function isBaseEffective(item: EffectiveTagAssignment) {
  return Boolean(item.sourceAssignmentId) && !['suspicious', 'invalid'].includes(item.status);
}

function hasFinalAction(state: ReconciledTagState) {
  return hasPhysicalEvidence(state) && Boolean(state.action && state.action !== 'keep_tag');
}

function knownIssueSuggestedAction(issue: KnownIssue) {
  const suggested = knownIssueActionLabel(issue.type);
  return suggested === 'INVESTIGAR' ? 'ACOMPANHAR ALERTA' : suggested;
}

function formatIssueList(values: string[]) {
  return values.filter(Boolean).join(' | ');
}

function conferenceDecision(record: AuditRecord) {
  if (record.status === 'unconfirmed') return 'NAO CONFIRMADA';
  if (record.status === 'tag_not_found') return 'TAG NAO LOCALIZADA';
  if (record.status === 'tag_stored') return 'TAG SEM ANIMAL';
  if (record.status === 'animal_without_ear_tag') return 'ANIMAL SEM BRINCO';
  if (record.status === 'correct') return 'CORRETA';
  if (record.status === 'possible_typo') return 'CORRIGIR NUMERO DA TAG';
  if (record.status === 'possible_swap') return 'TROCAR TAGS';
  if (record.status === 'new_tag' || record.status === 'tag_not_registered') return 'CADASTRAR TAG';
  if (record.status === 'linked' || record.status === 'tag_without_animal') return 'VINCULAR TAG';
  if (record.status === 'reassignment' || record.status === 'divergence' || record.status === 'animal_not_in_base') return 'MOVER TAG';
  return operationalActionLabel(record.operationalAction) || statusLabel(record.status).toUpperCase();
}

function isPhysicalTagRead(record: AuditRecord) {
  return isConfirmedEvidence(record) || record.status === 'animal_without_ear_tag';
}

function conferenceConfirmedValue(record: AuditRecord) {
  if (record.status === 'tag_not_found' || record.status === 'unconfirmed') return 'NAO';
  if (record.status === 'tag_stored' || record.status === 'animal_without_ear_tag') return 'SIM';
  return record.fieldDecision === 'confirmed_physical_animal' || record.fieldDecision === 'confirmed_match' ? 'SIM' : 'NAO';
}

function actionForResultState(input: {
  state: ReconciledTagState;
  effective: EffectiveTagAssignment | undefined;
  swapTagNumbers: Set<string>;
  tagNotFoundRecord: AuditRecord | undefined;
  animalWithoutEarTagRecord: AuditRecord | undefined;
  alert: string;
}) {
  const { state, effective, swapTagNumbers, tagNotFoundRecord, animalWithoutEarTagRecord, alert } = input;
  const finalAnimal = state.finalAnimal;
  const originalAnimal = state.originalAnimal;

  if (tagNotFoundRecord || effective?.status === 'not_found') {
    return {
      status: 'TAG NAO LOCALIZADA',
      animalCampo: '',
      resultado: 'NAO LOCALIZADA',
      acaoNoNedap: 'VERIFICAR NAO LOCALIZADA',
      tone: 'warning' as const
    };
  }

  if (!hasPhysicalEvidence(state)) {
    if (animalWithoutEarTagRecord) {
      return {
        status: 'ANIMAL SEM BRINCO',
        animalCampo: '',
        resultado: 'ANIMAL SEM BRINCO',
        acaoNoNedap: 'NENHUMA AUTOMATICA',
        tone: 'warning' as const
      };
    }
    if (state.assignment?.validationStatus === 'invalid_tag') {
      return {
        status: 'CADASTRO INVALIDO',
        animalCampo: '',
        resultado: 'CADASTRO INVALIDO',
        acaoNoNedap: 'REVISAR CADASTRO',
        tone: 'danger' as const
      };
    }
    if (state.assignment?.validationStatus === 'suspicious_tag') {
      return {
        status: 'CADASTRO SUSPEITO',
        animalCampo: '',
        resultado: 'CADASTRO SUSPEITO',
        acaoNoNedap: 'REVISAR CADASTRO',
        tone: 'warning' as const
      };
    }
    return {
      status: alert ? 'ALERTA' : 'PENDENTE',
      animalCampo: '',
      resultado: 'NAO CONFERIDA',
      acaoNoNedap: 'LOCALIZAR OU MARCAR NAO LOCALIZADA',
      tone: alert ? 'warning' as const : 'neutral' as const
    };
  }

  if (state.record?.status === 'possible_typo') {
    return {
      status: 'POSSIVEL ERRO CADASTRO',
      animalCampo: blank(finalAnimal),
      resultado: 'TAG FISICA CONFIRMADA',
      acaoNoNedap: 'CORRIGIR NUMERO DA TAG',
      tone: 'warning' as const
    };
  }

  if (swapTagNumbers.has(state.tagNumber)) {
    return {
      status: 'TROCA',
      animalCampo: blank(finalAnimal),
      resultado: 'TROCA CONFIRMADA',
      acaoNoNedap: 'TROCAR TAGS',
      tone: 'swap' as const
    };
  }

  if (state.action === 'move_tag') {
    return {
      status: 'MOVER',
      animalCampo: blank(finalAnimal),
      resultado: 'MOVIDA',
      acaoNoNedap: `MOVER ${blank(originalAnimal)} -> ${blank(finalAnimal)}`,
      tone: 'action' as const
    };
  }

  if (state.action === 'link_tag') {
    return {
      status: 'VINCULAR',
      animalCampo: blank(finalAnimal),
      resultado: 'VINCULADA',
      acaoNoNedap: `VINCULAR -> ${blank(finalAnimal)}`,
      tone: 'action' as const
    };
  }

  if (state.action === 'register_new_tag') {
    return {
      status: 'NOVA',
      animalCampo: blank(finalAnimal),
      resultado: 'NOVA TAG',
      acaoNoNedap: `CADASTRAR -> ${blank(finalAnimal)}`,
      tone: 'action' as const
    };
  }

  if (state.action === 'remove_tag') {
    return {
      status: 'SEM ANIMAL',
      animalCampo: 'SEM ANIMAL',
      resultado: 'TAG GUARDADA',
      acaoNoNedap: 'REMOVER VINCULO',
      tone: 'danger' as const
    };
  }

  if (state.action === 'replace_tag') {
    return {
      status: 'SUBSTITUIR',
      animalCampo: 'NOVA TAG',
      resultado: 'SUBSTITUICAO DE TAG',
      acaoNoNedap: 'SUBSTITUIR TAG',
      tone: 'action' as const
    };
  }

  if (state.action === 'tag_out_of_use') {
    return {
      status: 'TAG FORA DE USO',
      animalCampo: 'FORA DE USO',
      resultado: 'TAG FORA DE USO',
      acaoNoNedap: 'TAG FORA DE USO',
      tone: 'danger' as const
    };
  }

  return {
    status: alert ? 'ALERTA' : 'CORRETA',
    animalCampo: blank(finalAnimal),
    resultado: 'CORRETA',
    acaoNoNedap: 'NENHUMA',
    tone: alert ? 'warning' as const : 'success' as const
  };
}

export function buildAuditReportRows(
  audit: Audit,
  records: AuditRecord[],
  issues: ImportIssue[],
  effectiveAssignments: EffectiveTagAssignment[] = [],
  knownIssues: KnownIssue[] = [],
  assignments: TagAssignment[] = []
) {
  const ordered = chronological(records);
  const confirmed = ordered.filter(isConfirmedEvidence);
  const reconciliation = deriveReconciliation(assignments, records);
  const latestConfirmedByTag = new Map<string, AuditRecord>();
  for (const record of confirmed) latestConfirmedByTag.set(record.tagNumber, record);

  const current = records.filter((record) => record.isCurrent !== false);
  const effectiveByTag = new Map(effectiveAssignments.map((item) => [item.tagNumber, item]));
  const knownIssuesByTag = groupByTag(knownIssues);
  const importIssuesByTag = groupByTag(issues.filter((item) => item.tagNumber).map((item) => ({ ...item, tagNumber: item.tagNumber! })));
  const tagNotFoundByTag = latestCurrentByStatus(records, 'tag_not_found');
  const animalWithoutEarTagByTag = latestCurrentByStatus(records, 'animal_without_ear_tag');
  const baseAssignmentTags = new Set(
    assignments
      .filter((assignment) => (assignment.validationStatus ?? 'valid_tag') === 'valid_tag')
      .map((assignment) => assignment.tagNumber)
  );
  const totalValid = audit.validTags ?? audit.totalTags;
  const baseEffective = effectiveAssignments.filter(isBaseEffective);
  const processedCount = baseEffective.length
    ? baseEffective.filter((item) => item.status !== 'pending').length
    : new Set(current.filter((record) => baseAssignmentTags.has(record.tagNumber) && record.status !== 'unconfirmed').map((record) => record.tagNumber)).size;
  const swapPairs = reconciliation.swapPairs;
  const swapTagNumbers = new Set(swapPairs.flatMap((pair) => [pair.left.tagNumber, pair.right.tagNumber]));
  const finalActionStates = reconciliation.states.filter((state) =>
    hasPhysicalEvidence(state) &&
    state.action &&
    state.action !== 'keep_tag' &&
    !swapTagNumbers.has(state.tagNumber)
  );
  const definitiveTags = new Set(reconciliation.states.filter(hasFinalAction).map((state) => state.tagNumber));
  const finalPhysicalTags = new Set(reconciliation.finalRecordByTag.keys());

  const safeTypoMatch = (record: AuditRecord) => assignments
    .filter((assignment) => assignment.validationStatus === 'suspicious_tag' && assignment.tagNumber !== record.tagNumber)
    .filter((assignment) => assignment.tagNumber.length === record.tagNumber.length)
    .sort((a, b) => {
      const distance = (tag: string) => [...tag].reduce((count, char, index) => count + (char !== record.tagNumber[index] ? 1 : 0), 0);
      return distance(a.tagNumber) - distance(b.tagNumber);
    })[0] ?? null;

  const actionRows: SheetRows = [
    ['ACAO', 'SMARTTAG', 'CADASTRO ATUAL', 'CORRIGIR PARA', 'ANIMAL', 'OBSERVACAO']
  ];
  for (const pair of swapPairs) {
    const left = pair.left.record;
    const right = pair.right.record;
    if (!left || !right) continue;
    actionRows.push([
      'TROCAR TAGS',
      `${blank(left.tagNumber)} / ${blank(right.tagNumber)}`,
      `${blank(left.expectedAnimal)}: ${blank(left.tagNumber)}; ${blank(right.expectedAnimal)}: ${blank(right.tagNumber)}`,
      `${blank(left.expectedAnimal)}: ${blank(right.tagNumber)}; ${blank(right.expectedAnimal)}: ${blank(left.tagNumber)}`,
      `${blank(left.expectedAnimal)} / ${blank(right.expectedAnimal)}`,
      'Executar uma unica troca dos vinculos no Nedap.'
    ]);
  }

  for (const state of finalActionStates) {
    const record = state.record!;
    if (record.status === 'possible_swap' || record.status === 'possible_typo') continue;
    if (record.operationalAction === 'remove_tag') {
      actionRows.push(['REMOVER VINCULO', blank(state.tagNumber), blank(state.originalAnimal ?? state.finalAnimal), 'SEM ANIMAL', blank(state.originalAnimal ?? state.finalAnimal), blank(record.actionNote ?? record.note)]);
      continue;
    }
    if (record.operationalAction === 'replace_tag') {
      actionRows.push(['SUBSTITUIR TAG', blank(state.tagNumber), blank(state.originalAnimal ?? state.finalAnimal), 'NOVA TAG', blank(state.originalAnimal ?? state.finalAnimal), blank(record.actionNote ?? record.note)]);
      continue;
    }
    if (record.operationalAction === 'tag_out_of_use') {
      actionRows.push(['MARCAR TAG FORA DE USO', blank(state.tagNumber), blank(state.originalAnimal ?? state.finalAnimal), 'FORA DE USO', blank(state.originalAnimal ?? state.finalAnimal), blank(record.actionNote ?? record.note)]);
      continue;
    }
    if (state.action === 'move_tag') {
      actionRows.push(['MOVER TAG', blank(state.tagNumber), blank(state.originalAnimal), blank(state.finalAnimal), blank(state.finalAnimal), blank(record.actionNote ?? record.note)]);
    } else if (state.action === 'link_tag') {
      actionRows.push(['VINCULAR TAG', blank(state.tagNumber), 'SEM ANIMAL', blank(state.finalAnimal), blank(state.finalAnimal), blank(record.actionNote ?? record.note)]);
    } else if (state.action === 'register_new_tag') {
      actionRows.push(['CADASTRAR TAG', blank(state.tagNumber), 'SEM CADASTRO', blank(state.finalAnimal), blank(state.finalAnimal), blank(record.actionNote ?? record.note)]);
    }
  }

  for (const record of finalActionStates.map((state) => state.record!).filter((item) => item.status === 'possible_typo')) {
    const match = safeTypoMatch(record);
    if (match) {
      actionRows.push(['CORRIGIR NUMERO DA TAG', blank(match.tagNumber), blank(match.tagNumber), blank(record.tagNumber), blank(record.observedAnimal), 'Relacao confirmada em campo; corrigir o cadastro da SmartTag.']);
    } else {
      actionRows.push(['CADASTRAR TAG', blank(record.tagNumber), 'SEM CADASTRO', blank(record.observedAnimal), blank(record.observedAnimal), 'Possivel erro de cadastro, mas a evidencia fisica confirmada prevalece.']);
    }
  }

  const animalGapRows: SheetRows = [
    ['ANIMAL', 'TAG ORIGINAL', 'ULTIMA EVIDENCIA DA TAG', 'OBSERVACAO'],
    ...reconciliation.animalsWithoutConfirmedTag.map((gap) => [
      blank(gap.animal),
      blank(gap.originalTag),
      gap.record ? `${blank(gap.record.tagNumber)} -> ${blank(gap.record.observedAnimal)}` : '',
      'Nenhuma tag confirmada terminou neste animal no estado final.'
    ])
  ];

  const reviewRows: SheetRows = [
    ['TIPO', 'SMARTTAG', 'ANIMAL / CONTEXTO', 'DESCRICAO', 'ACAO SUGERIDA', 'OBSERVACAO']
  ];
  const reviewSeen = new Set<string>();
  const pushReview = (type: string, tag: string, context: string, description: string, action: string, observation = '') => {
    const key = `${type}:${tag}:${context}:${description}`;
    if (reviewSeen.has(key)) return;
    reviewSeen.add(key);
    reviewRows.push([type, tag, context, description, action, observation]);
  };

  const latestUnconfirmedByTag = new Map<string, AuditRecord>();
  for (const record of ordered.filter((item) => item.status === 'unconfirmed')) latestUnconfirmedByTag.set(record.tagNumber, record);
  for (const record of latestUnconfirmedByTag.values()) {
    if (definitiveTags.has(record.tagNumber) || finalPhysicalTags.has(record.tagNumber)) continue;
    const confirmedRecord = latestConfirmedByTag.get(record.tagNumber);
    pushReview('NAO CONFIRMADA', blank(record.tagNumber), blank(record.observedAnimal ?? record.expectedAnimal), `Tentativa: ${blank(record.observedAnimal)}`, 'REVISAR', blank(confirmedRecord?.observedAnimal));
  }
  for (const record of current.filter((item) => ['audit_conflict', 'new_tag_conflict'].includes(item.status))) {
    pushReview('CONFLITO', blank(record.tagNumber), blank(record.observedAnimal ?? record.expectedAnimal), blank(record.note ?? record.actionNote), 'INVESTIGAR', blank(reconciliation.finalRecordByTag.get(record.tagNumber)?.observedAnimal));
  }
  for (const record of tagNotFoundByTag.values()) {
    pushReview('TAG NAO LOCALIZADA', blank(record.tagNumber), blank(record.expectedAnimal), blank(record.note ?? record.actionNote), 'VERIFICAR NAO LOCALIZADA');
  }
  for (const record of animalWithoutEarTagByTag.values()) {
    pushReview('ANIMAL SEM BRINCO', blank(record.tagNumber), blank(record.expectedAnimal), blank(record.note ?? record.actionNote), 'REGISTRADO');
  }
  for (const item of effectiveAssignments.filter((entry) => ['not_found', 'unresolved', 'suspicious', 'invalid'].includes(entry.status))) {
    if (item.status === 'not_found' && tagNotFoundByTag.has(item.tagNumber)) continue;
    if (item.status === 'unresolved' && animalWithoutEarTagByTag.has(item.tagNumber)) continue;
    if (item.status === 'unresolved' && definitiveTags.has(item.tagNumber)) continue;
    const record = reconciliation.finalRecordByTag.get(item.tagNumber);
    pushReview(
      item.status === 'not_found' ? 'TAG NAO LOCALIZADA' : item.status === 'suspicious' ? 'CADASTRO SUSPEITO' : item.status === 'invalid' ? 'CADASTRO INVALIDO' : 'PENDENCIA',
      blank(item.tagNumber),
      blank(item.effectiveAnimal ?? item.originalAnimal),
      blank(record?.note ?? record?.actionNote),
      item.status === 'not_found' ? 'VERIFICAR NAO LOCALIZADA' : 'REVISAR',
      blank(record?.observedAnimal)
    );
  }
  for (const issue of knownIssues) {
    pushReview('PROBLEMA CONHECIDO', blank(issue.tagNumber), '', knownIssueLabel(issue.type), knownIssueSuggestedAction(issue), blank(issue.note));
  }
  for (const issue of issues.filter((item) => ['possible_typo', 'suspicious_tag', 'invalid_tag'].includes(item.type))) {
    pushReview('CADASTRO SUSPEITO', blank(issue.tagNumber), blank(issue.animal), blank(issue.detail), 'REVISAR CADASTRO');
  }

  const conferenceRows: SheetRows = [
    ['SEQUENCIA', 'DATA/HORA', 'TAG', 'ANIMAL NEDAP', 'ANIMAL OBSERVADO', 'CONFIRMADO?', 'ORIGEM', 'DECISAO', 'EVENTO RELACIONADO'],
    ...ordered.map((record) => [
      record.sequence ?? '',
      formatDateTime(record.scannedAt),
      blank(record.tagNumber),
      blank(record.expectedAnimal),
      blank(record.observedAnimal),
      conferenceConfirmedValue(record),
      record.source === 'nfc' ? 'NFC' : 'Manual',
      conferenceDecision(record),
      blank(record.relatedRecordId)
    ])
  ];

  const basePhysicallyFoundCount = new Set(current
    .filter((record) => baseAssignmentTags.has(record.tagNumber) && isPhysicalTagRead(record))
    .map((record) => record.tagNumber)
  ).size;
  const baseNotLocatedTags = new Set([
    ...baseEffective.filter((item) => item.status === 'not_found').map((item) => item.tagNumber),
    ...[...tagNotFoundByTag.keys()].filter((tagNumber) => baseAssignmentTags.has(tagNumber))
  ]);
  const newTagsCount = reconciliation.states.filter((state) => !state.assignment && hasPhysicalEvidence(state)).length;
  const correctCount = reconciliation.states.filter((state) =>
    hasPhysicalEvidence(state) &&
    state.assignment?.expectedAnimal &&
    state.finalAnimal === state.assignment.expectedAnimal
  ).length;
  const actionCount = actionRows.length - 1;
  const reviewCount = reviewRows.length - 1;
  const animalsWithoutConfirmedTag = reconciliation.animalsWithoutConfirmedTag.length;

  const summaryRows: SheetRows = [
    ['CAMPO', 'VALOR'],
    ['Fazenda', blank(audit.farmName)],
    ['Data inicio', formatDateTime(audit.startedAt)],
    ['Data fim', audit.finishedAt ? formatDateTime(audit.finishedAt) : ''],
    ['Tags validas da base', totalValid],
    ['Tags da base com resultado', processedCount],
    ['Tags da base encontradas fisicamente', basePhysicallyFoundCount],
    ['Tags nao localizadas', baseNotLocatedTags.size],
    ['Tags novas encontradas', newTagsCount],
    ['Percentual concluido', percent(processedCount, totalValid)],
    ['Tags corretas', correctCount],
    ['Acoes no Nedap', actionCount],
    ['Itens para revisar', reviewCount],
    ['Animais sem tag', animalsWithoutConfirmedTag],
    ['Registros suspeitos', (audit.suspiciousTags ?? 0) + issues.filter((item) => ['possible_typo', 'suspicious_tag', 'invalid_tag'].includes(item.type)).length]
  ];

  const resultHeader = ['STATUS', 'SMARTTAG', 'ANIMAL NEDAP', 'ANIMAL CAMPO', 'RESULTADO', 'ACAO NO NEDAP', 'ALERTA / OBSERVACAO', 'ULTIMA CONFIRMACAO'];
  const assignmentOrder = new Map(assignments.map((assignment, index) => [assignment.tagNumber, index]));
  const resultFinalRows: ResultFinalRow[] = reconciliation.states
    .filter((state) => state.assignment || hasPhysicalEvidence(state) || effectiveByTag.has(state.tagNumber))
    .sort((a, b) => {
      const orderA = assignmentOrder.get(a.tagNumber) ?? Number.MAX_SAFE_INTEGER;
      const orderB = assignmentOrder.get(b.tagNumber) ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return (a.record?.sequence ?? Number.MAX_SAFE_INTEGER) - (b.record?.sequence ?? Number.MAX_SAFE_INTEGER);
    })
    .map((state) => {
      const effective = effectiveByTag.get(state.tagNumber);
      const knownAlerts = (knownIssuesByTag.get(state.tagNumber) ?? []).map((issue) => `PROBLEMA CONHECIDO: ${knownIssueLabel(issue.type)}${issue.note ? ` - ${issue.note}` : ''}`);
      const importAlerts = (importIssuesByTag.get(state.tagNumber) ?? []).map((issue) => issue.detail);
      const unresolvedAnimalWithoutEarTag = animalWithoutEarTagByTag.has(state.tagNumber) && hasPhysicalEvidence(state) ? 'ANIMAL SEM BRINCO REGISTRADO DEPOIS DA ULTIMA EVIDENCIA FISICA' : '';
      const alert = formatIssueList([...knownAlerts, ...importAlerts, unresolvedAnimalWithoutEarTag]);
      const result = actionForResultState({
        state,
        effective,
        swapTagNumbers,
        tagNotFoundRecord: tagNotFoundByTag.get(state.tagNumber),
        animalWithoutEarTagRecord: animalWithoutEarTagByTag.get(state.tagNumber),
        alert
      });
      const latestRecord = state.record ?? tagNotFoundByTag.get(state.tagNumber) ?? animalWithoutEarTagByTag.get(state.tagNumber) ?? null;
      return {
        status: result.status,
        smartTag: blank(state.tagNumber),
        animalNedap: state.assignment ? blank(state.originalAnimal) || 'SEM ANIMAL' : 'NAO CADASTRADA',
        animalCampo: result.animalCampo,
        resultado: result.resultado,
        acaoNoNedap: result.acaoNoNedap,
        alerta: alert,
        ultimaConfirmacao: latestRecord ? formatDateTime(latestRecord.scannedAt) : '',
        tone: result.tone
      };
    });

  const resultRows: SheetRows = [
    ['BIPTAG - RESULTADO FINAL'],
    ['Fazenda', blank(audit.farmName)],
    ['Data inicio', formatDateTime(audit.startedAt)],
    ['Data fim', audit.finishedAt ? formatDateTime(audit.finishedAt) : ''],
    [],
    ['RESUMO', ''],
    ['Tags validas da base', totalValid],
    ['Tags da base com resultado', processedCount],
    ['Tags da base encontradas fisicamente', basePhysicallyFoundCount],
    ['Tags nao localizadas', baseNotLocatedTags.size],
    ['Tags novas encontradas', newTagsCount],
    ['Corretas', correctCount],
    ['Acoes no Nedap', actionCount],
    ['Alertas e pendencias', reviewCount],
    ['Animais sem tag', animalsWithoutConfirmedTag],
    [],
    resultHeader,
    ...resultFinalRows.map((row) => [
      row.status,
      row.smartTag,
      row.animalNedap,
      row.animalCampo,
      row.resultado,
      row.acaoNoNedap,
      row.alerta,
      row.ultimaConfirmacao
    ])
  ];

  const metrics: ReportMetrics = {
    totalValid,
    baseResolvedCount: processedCount,
    basePhysicallyFoundCount,
    baseNotLocatedCount: baseNotLocatedTags.size,
    newTagsCount,
    correctCount,
    actionCount,
    reviewCount,
    animalsWithoutConfirmedTag
  };

  return { resultRows, resultFinalRows, actionRows, animalGapRows, reviewRows, conferenceRows, summaryRows, metrics };
}

function whatsappActionLine(row: SheetRows[number]) {
  const [action, tag, current, target, animal] = row.map((value) => blank(value));
  if (action === 'MOVER TAG') return `- MOVER TAG: ${current} -> ${target}, tag ${tag}`;
  if (action === 'TROCAR TAGS') return `- TROCAR TAGS: ${animal}, tags ${tag}`;
  if (action === 'VINCULAR TAG') return `- VINCULAR TAG: ${target}, tag ${tag}`;
  if (action === 'CADASTRAR TAG') return `- CADASTRAR TAG: ${target}, tag ${tag}`;
  if (action === 'REMOVER VINCULO') return `- REMOVER VINCULO: ${current}, tag ${tag}`;
  if (action === 'SUBSTITUIR TAG') return `- SUBSTITUIR TAG: ${current}, tag ${tag}`;
  return `- ${action}: ${target || animal || current}, tag ${tag}`;
}

export function buildAuditWhatsAppText(
  audit: Audit,
  records: AuditRecord[],
  issues: ImportIssue[],
  effectiveAssignments: EffectiveTagAssignment[] = [],
  knownIssues: KnownIssue[] = [],
  assignments: TagAssignment[] = []
) {
  const report = buildAuditReportRows(audit, records, issues, effectiveAssignments, knownIssues, assignments);
  const actionRows = report.actionRows.slice(1);
  const reviewRows = report.reviewRows.slice(1);
  const swapCount = actionRows.filter((row) => row[0] === 'TROCAR TAGS').length;
  const lines = [
    `BIPTAG - Auditoria ${audit.farmName}`,
    '',
    'Resumo:',
    `- Tags da base com resultado: ${report.metrics.baseResolvedCount}/${report.metrics.totalValid}`,
    `- Encontradas fisicamente: ${report.metrics.basePhysicallyFoundCount}`,
    `- Nao localizadas: ${report.metrics.baseNotLocatedCount}`,
    `- Tags novas: ${report.metrics.newTagsCount}`,
    '',
    `- Corretas: ${report.metrics.correctCount}`,
    `- Trocas confirmadas: ${swapCount}`,
    `- Acoes no Nedap: ${report.metrics.actionCount}`
  ];

  if (actionRows.length) {
    lines.push('', 'Acoes principais:');
    lines.push(...actionRows.slice(0, 12).map(whatsappActionLine));
    if (actionRows.length > 12) lines.push(`- mais ${actionRows.length - 12} acao(oes) no relatorio`);
  }

  if (reviewRows.length) {
    lines.push('', 'Alertas e pendencias:');
    for (const row of reviewRows.slice(0, 8)) {
      const [type, tag, context, description, action] = row.map((value) => blank(value));
      lines.push(`- ${type}: ${tag || context}${description ? ` - ${description}` : ''}${action ? ` (${action})` : ''}`);
    }
    if (reviewRows.length > 8) lines.push(`- mais ${reviewRows.length - 8} item(ns) no relatorio`);
  }

  lines.push('', 'Correcoes devem ser executadas no Nedap somente apos revisar o relatorio completo.');
  return lines.join('\n');
}

function buildAuditReportRowsLegacy(
  audit: Audit,
  records: AuditRecord[],
  issues: ImportIssue[],
  effectiveAssignments: EffectiveTagAssignment[] = [],
  knownIssues: KnownIssue[] = [],
  assignments: TagAssignment[] = []
) {
  const ordered = chronological(records);
  const confirmed = ordered.filter(isConfirmedEvidence);
  const reconciliation = deriveReconciliation(assignments, records);
  const latestConfirmedByTag = new Map<string, AuditRecord>();
  for (const record of confirmed) latestConfirmedByTag.set(record.tagNumber, record);
  const latestConfirmed = [...latestConfirmedByTag.values()];
  const current = records.filter((record) => record.isCurrent !== false);
  const latestUnconfirmedByTag = new Map<string, AuditRecord>();
  for (const record of ordered.filter((item) => item.status === 'unconfirmed')) latestUnconfirmedByTag.set(record.tagNumber, record);
  const latestUnconfirmed = [...latestUnconfirmedByTag.values()];
  const validEffective = effectiveAssignments.filter((item) => !['suspicious', 'invalid'].includes(item.status));
  const processedEffective = validEffective.filter((item) => item.status !== 'pending');
  const processedCount = validEffective.length ? processedEffective.length : new Set(latestConfirmed.map((record) => record.tagNumber)).size;
  const totalValid = audit.validTags ?? audit.totalTags;
  const pending = Math.max(totalValid - processedCount, 0);
  const swapPairs = reconciliation.swapPairs;
  const swapTagNumbers = new Set(swapPairs.flatMap((pair) => [pair.left.tagNumber, pair.right.tagNumber]));
  const finalActionStates = reconciliation.states.filter((state) =>
    hasPhysicalEvidence(state) &&
    state.action &&
    state.action !== 'keep_tag' &&
    !swapTagNumbers.has(state.tagNumber)
  );
  const swapGroups = new Map<string, AuditRecord[]>();
  for (const pair of swapPairs) {
    const group = [pair.left.record, pair.right.record].filter((record): record is AuditRecord => Boolean(record));
    if (group.length) swapGroups.set(`${pair.left.tagNumber}:${pair.right.tagNumber}`, group);
  }
  const safeTypoMatch = (record: AuditRecord) => assignments
    .filter((assignment) => assignment.validationStatus === 'suspicious_tag' && assignment.tagNumber !== record.tagNumber)
    .filter((assignment) => assignment.tagNumber.length === record.tagNumber.length)
    .sort((a, b) => {
      const distance = (tag: string) => [...tag].reduce((count, char, index) => count + (char !== record.tagNumber[index] ? 1 : 0), 0);
      return distance(a.tagNumber) - distance(b.tagNumber);
    })[0] ?? null;

  const actionRows: (string | number)[][] = [
    ['AÇÃO', 'TAG', 'CADASTRO ATUAL', 'CORRIGIR PARA', 'ANIMAL', 'OBSERVAÇÃO']
  ];
  for (const group of swapGroups.values()) {
    const left = group.find((record) => record.expectedAnimal && record.observedAnimal) ?? group[0];
    const right = group.find((record) => record.id !== left.id) ?? group[1];
    if (!left || !right) continue;
    actionRows.push([
      'TROCAR TAGS',
      `${blank(left.tagNumber)} / ${blank(right.tagNumber)}`,
      `${blank(left.expectedAnimal)}: ${blank(left.tagNumber)}; ${blank(right.expectedAnimal)}: ${blank(right.tagNumber)}`,
      `${blank(left.expectedAnimal)}: ${blank(right.tagNumber)}; ${blank(right.expectedAnimal)}: ${blank(left.tagNumber)}`,
      `${blank(left.expectedAnimal)} / ${blank(right.expectedAnimal)}`,
      'Executar uma única troca dos vínculos no Nedap.'
    ]);
  }

  for (const state of finalActionStates) {
    const record = state.record!;
    if (record.status === 'possible_swap' || record.status === 'possible_typo') continue;
    if (record.operationalAction === 'remove_tag') {
      actionRows.push(['REMOVER VÍNCULO', blank(state.tagNumber), blank(state.originalAnimal ?? state.finalAnimal), 'SEM ANIMAL', blank(state.originalAnimal ?? state.finalAnimal), blank(record.actionNote ?? record.note)]);
      continue;
    }
    if (record.operationalAction === 'replace_tag') {
      actionRows.push(['SUBSTITUIR TAG', blank(state.tagNumber), blank(state.originalAnimal ?? state.finalAnimal), 'NOVA TAG', blank(state.originalAnimal ?? state.finalAnimal), blank(record.actionNote ?? record.note)]);
      continue;
    }
    if (record.operationalAction === 'tag_out_of_use') {
      actionRows.push(['MARCAR TAG FORA DE USO', blank(state.tagNumber), blank(state.originalAnimal ?? state.finalAnimal), 'FORA DE USO', blank(state.originalAnimal ?? state.finalAnimal), blank(record.actionNote ?? record.note)]);
      continue;
    }
    if (state.action === 'move_tag') {
      actionRows.push(['MOVER TAG', blank(state.tagNumber), blank(state.originalAnimal), blank(state.finalAnimal), blank(state.finalAnimal), blank(record.actionNote ?? record.note)]);
    } else if (state.action === 'link_tag') {
      actionRows.push(['VINCULAR TAG', blank(state.tagNumber), 'SEM ANIMAL', blank(state.finalAnimal), blank(state.finalAnimal), blank(record.actionNote ?? record.note)]);
    } else if (state.action === 'register_new_tag') {
      actionRows.push(['CADASTRAR TAG', blank(state.tagNumber), 'SEM CADASTRO', blank(state.finalAnimal), blank(state.finalAnimal), blank(record.actionNote ?? record.note)]);
    }
  }
  for (const record of finalActionStates.map((state) => state.record!).filter((item) => item.status === 'possible_typo')) {
    const match = safeTypoMatch(record);
    if (match) {
      actionRows.push(['CORRIGIR TAG', blank(match.tagNumber), blank(match.tagNumber), blank(record.tagNumber), blank(record.observedAnimal), 'Relação confirmada em campo; corrigir o cadastro da SmartTag.']);
    } else {
      actionRows.push(['CADASTRAR TAG', blank(record.tagNumber), 'SEM CADASTRO', blank(record.observedAnimal), blank(record.observedAnimal), 'Possivel erro de cadastro, mas a evidencia fisica confirmada prevalece.']);
    }
  }

  const animalGapRows: (string | number)[][] = [
    ['ANIMAL', 'TAG ORIGINAL', 'ULTIMA EVIDENCIA DA TAG', 'OBSERVACAO'],
    ...reconciliation.animalsWithoutConfirmedTag.map((gap) => [
      blank(gap.animal),
      blank(gap.originalTag),
      gap.record ? `${blank(gap.record.tagNumber)} -> ${blank(gap.record.observedAnimal)}` : '',
      'Nenhuma tag confirmada terminou neste animal no estado final.'
    ])
  ];

  const reviewRows: (string | number)[][] = [
    ['TIPO', 'TAG', 'ANIMAL / CONTEXTO', 'O QUE ACONTECEU', 'ÚLTIMA EVIDÊNCIA CONFIRMADA', 'AÇÃO SUGERIDA']
  ];
  for (const record of latestUnconfirmed) {
    const confirmedRecord = latestConfirmedByTag.get(record.tagNumber);
    reviewRows.push(['NÃO CONFIRMADA', blank(record.tagNumber), blank(record.observedAnimal ?? record.expectedAnimal), `Tentativa: ${blank(record.observedAnimal)}`, blank(confirmedRecord?.observedAnimal), 'INVESTIGAR']);
  }
  for (const record of current.filter((item) => ['audit_conflict', 'new_tag_conflict'].includes(item.status))) {
    reviewRows.push(['CONFLITO', blank(record.tagNumber), blank(record.observedAnimal ?? record.expectedAnimal), blank(record.note ?? record.actionNote), blank(reconciliation.finalRecordByTag.get(record.tagNumber)?.observedAnimal), 'INVESTIGAR']);
  }
  for (const item of effectiveAssignments.filter((entry) => ['not_found', 'unresolved', 'suspicious', 'invalid'].includes(entry.status))) {
    const record = reconciliation.finalRecordByTag.get(item.tagNumber);
    reviewRows.push([
      item.status === 'not_found' ? 'TAG NAO LOCALIZADA' : item.status === 'suspicious' ? 'CADASTRO SUSPEITO' : item.status === 'invalid' ? 'CADASTRO INVALIDO' : 'PENDENCIA',
      blank(item.tagNumber),
      blank(item.effectiveAnimal ?? item.originalAnimal),
      blank(record?.note ?? record?.actionNote),
      blank(record?.observedAnimal),
      item.status === 'not_found' ? 'REGISTRADO' : 'REVISAR'
    ]);
  }
  for (const record of current.filter((item) => item.status === 'animal_without_ear_tag')) {
    reviewRows.push(['ANIMAL SEM BRINCO', blank(record.tagNumber), blank(record.expectedAnimal), blank(record.note ?? record.actionNote), '', 'REGISTRADO']);
  }
  for (const issue of knownIssues) reviewRows.push(['PROBLEMA CONHECIDO', blank(issue.tagNumber), '', blank(issue.note), '', 'INVESTIGAR']);
  for (const issue of issues.filter((item) => ['possible_typo', 'suspicious_tag', 'invalid_tag'].includes(item.type))) reviewRows.push(['CADASTRO SUSPEITO', blank(issue.tagNumber), blank(issue.animal), blank(issue.detail), '', 'INVESTIGAR']);

  const conferenceRows: (string | number)[][] = [
    ['SEQUÊNCIA', 'DATA/HORA', 'TAG', 'ANIMAL NEDAP', 'ANIMAL OBSERVADO', 'CONFIRMADO?', 'ORIGEM', 'DECISÃO', 'EVENTO RELACIONADO'],
    ...ordered.map((record) => [
      record.sequence ?? '',
      formatDateTime(record.scannedAt),
      blank(record.tagNumber),
      blank(record.expectedAnimal),
      blank(record.observedAnimal),
      record.fieldDecision === 'confirmed_physical_animal' || record.fieldDecision === 'confirmed_match' ? 'SIM' : 'NÃO',
      record.source === 'nfc' ? 'NFC' : 'Manual',
      record.status === 'unconfirmed' ? 'NÃO CONFIRMADA' : record.status === 'tag_stored' ? 'TAG SEM ANIMAL' : record.status === 'animal_without_ear_tag' ? 'ANIMAL SEM BRINCO' : record.status === 'correct' ? 'CORRETA' : record.status === 'possible_typo' ? 'CORRIGIR TAG' : record.status === 'possible_swap' ? 'TROCAR TAGS' : record.status === 'reassignment' || record.status === 'divergence' ? 'MOVER TAG' : record.status === 'linked' || record.status === 'tag_without_animal' ? 'VINCULAR TAG' : 'REVISAR',
      blank(record.relatedRecordId)
    ])
  ];

  const correctCount = reconciliation.states.filter((state) =>
    hasPhysicalEvidence(state) &&
    state.assignment?.expectedAnimal &&
    state.finalAnimal === state.assignment.expectedAnimal
  ).length;
  const actionCount = actionRows.length - 1;
  const reviewCount = reviewRows.length - 1;
  const animalsWithoutConfirmedTag = reconciliation.animalsWithoutConfirmedTag.length;
  const summaryRows: (string | number)[][] = [
    ['CAMPO', 'VALOR'],
    ['Fazenda', blank(audit.farmName)],
    ['Data início', formatDateTime(audit.startedAt)],
    ['Data fim', audit.finishedAt ? formatDateTime(audit.finishedAt) : ''],
    ['Tags válidas da base', totalValid],
    ['Tags conferidas', processedCount],
    ['Percentual concluído', percent(processedCount, totalValid)],
    ['Tags corretas', correctCount],
    ['Correções necessárias', actionCount],
    ['Itens para revisar', reviewCount],
    ['Tags novas', finalActionStates.filter((state) => state.action === 'register_new_tag' && state.record?.status !== 'possible_typo').length],
    ['Tags não localizadas', effectiveAssignments.filter((item) => item.status === 'not_found').length],
    ['Animais sem tag', animalsWithoutConfirmedTag],
    ['Registros suspeitos', (audit.suspiciousTags ?? 0) + issues.filter((item) => ['possible_typo', 'suspicious_tag', 'invalid_tag'].includes(item.type)).length]
  ];

  return { actionRows, animalGapRows, reviewRows, conferenceRows, summaryRows };
}

export function createAuditWorkbook(
  audit: Audit,
  records: AuditRecord[],
  issues: ImportIssue[],
  effectiveAssignments: EffectiveTagAssignment[] = [],
  knownIssues: KnownIssue[] = [],
  assignments: TagAssignment[] = []
) {
  const { resultRows, actionRows, animalGapRows, reviewRows, conferenceRows } = buildAuditReportRows(
    audit,
    records,
    issues,
    effectiveAssignments,
    knownIssues,
    assignments
  );
  const workbook = XLSX.utils.book_new();
  appendSheet(workbook, resultRows, 'RESULTADO FINAL', { tableHeader: ['STATUS', 'SMARTTAG'], textColumns: ['SMARTTAG'], statusColors: true });
  appendSheet(workbook, actionRows, 'CORRIGIR NO NEDAP', { tableHeader: ['ACAO', 'SMARTTAG'], textColumns: ['SMARTTAG'], statusColors: true });
  appendSheet(workbook, reviewRows, 'ALERTAS E PENDENCIAS', { tableHeader: ['TIPO', 'SMARTTAG'], textColumns: ['SMARTTAG'], statusColors: true });
  appendSheet(workbook, animalGapRows, 'ANIMAIS SEM TAG', { tableHeader: ['ANIMAL', 'TAG ORIGINAL'], textColumns: ['TAG ORIGINAL'] });
  appendSheet(workbook, conferenceRows, 'CONFERENCIA', { tableHeader: ['SEQUENCIA', 'DATA/HORA'], textColumns: ['TAG'] });

  return workbook;
}

export function exportAuditWorkbook(
  audit: Audit,
  records: AuditRecord[],
  issues: ImportIssue[],
  effectiveAssignments: EffectiveTagAssignment[] = [],
  knownIssues: KnownIssue[] = [],
  assignments: TagAssignment[] = []
) {
  const workbook = createAuditWorkbook(audit, records, issues, effectiveAssignments, knownIssues, assignments);

  const safeFarm = audit.farmName
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 80) || 'fazenda';
  XLSX.writeFile(workbook, `Auditoria_${safeFarm}.xlsx`);
}

export function reviewLabel(reviewStatus: AuditRecord['reviewStatus']) {
  if (reviewStatus === 'resolved') return 'Resolvido';
  if (reviewStatus === 'open') return 'Pendente';
  return 'Nao necessaria';
}
