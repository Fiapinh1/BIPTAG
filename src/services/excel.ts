import * as XLSX from 'xlsx';
import type {
  Audit,
  AuditRecord,
  EffectiveTagAssignment,
  ImportIssue,
  ImportPreview,
  RecordStatus,
  SmartTagPattern,
  TagAssignment,
  TagValidationStatus
} from '../types/domain';

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

function appendSheet(workbook: XLSX.WorkBook, rows: (string | number)[][], name: string) {
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
}

function effectiveStatusLabel(status: EffectiveTagAssignment['status']) {
  const labels: Record<EffectiveTagAssignment['status'], string> = {
    pending: 'Pendente',
    confirmed: 'Confirmada',
    reassigned: 'Reatribuida',
    linked: 'Vinculada em campo',
    new_tag: 'Nova tag',
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
    confirmed: 'Nenhuma',
    reassigned: 'Alterar vinculo no Nedap',
    linked: 'Criar vinculo no Nedap',
    new_tag: 'Cadastrar nova SmartTag no Nedap',
    displaced: 'Localizar tag deslocada ou remover vinculo antigo',
    not_found: 'Investigar colar perdido, animal fora do lote ou cadastro antigo',
    suspicious: 'Corrigir cadastro da base',
    invalid: 'Corrigir formato da tag na base',
    unresolved: 'Revisar em campo'
  };
  return actions[status];
}

export function exportAuditWorkbook(
  audit: Audit,
  records: AuditRecord[],
  issues: ImportIssue[],
  effectiveAssignments: EffectiveTagAssignment[] = []
) {
  const ordered = chronological(records);
  const current = records.filter((record) => record.isCurrent !== false);
  const validEffective = effectiveAssignments.filter((item) => !['suspicious', 'invalid'].includes(item.status));
  const processedEffective = validEffective.filter((item) => item.status !== 'pending');
  const processedCount = validEffective.length ? processedEffective.length : new Set(current.map((record) => record.tagNumber)).size;
  const totalValid = audit.validTags ?? audit.totalTags;
  const pending = Math.max(totalValid - processedCount, 0);

  const summaryRows: (string | number)[][] = [
    ['Campo', 'Valor'],
    ['Fazenda', blank(audit.farmName)],
    ['Data de inicio', formatDateTime(audit.startedAt)],
    ['Data de conclusao', audit.finishedAt ? formatDateTime(audit.finishedAt) : ''],
    ['Total de linhas importadas', audit.totalRows ?? audit.totalTags],
    ['Tags validas', totalValid],
    ['Registros suspeitos', audit.suspiciousTags ?? 0],
    ['Registros invalidos', audit.invalidTags ?? 0],
    ['Tags processadas', processedCount],
    ['Tags confirmadas', countStatus(current, 'correct')],
    ['Tags reatribuidas', countStatus(current, 'reassignment') + countStatus(current, 'divergence') + countStatus(current, 'possible_swap')],
    ['Tags novas', countStatus(current, 'new_tag')],
    ['Tags sem vinculo resolvidas', countStatus(current, 'linked') + countStatus(current, 'tag_without_animal')],
    ['Tags nao localizadas', effectiveAssignments.filter((item) => item.status === 'not_found').length + countStatus(current, 'tag_not_found')],
    ['Animais fora da base', countStatus(current, 'animal_not_in_base')],
    ['Nao confirmadas', countStatus(current, 'unconfirmed')],
    ['Trocas Confirmadas', countPairs(records, 'possible_swap')],
    ['Trocas Pendentes', countStatus(current, 'reassignment') + countStatus(current, 'divergence')],
    ['Conflitos de Auditoria', countPairs(records, 'audit_conflict')],
    ['Cadeias', countStatus(current, 'replacement_chain')],
    ['Pendencias', pending + current.filter((record) => record.reviewStatus === 'open').length],
    ['Percentual processado', percent(processedCount, totalValid)]
  ];

  const finalRows: (string | number)[][] = [
    ['Tag', 'Animal Original', 'Animal Final', 'Situacao', 'Acao Necessaria'],
    ...effectiveAssignments.map((item) => [
      blank(item.tagNumber),
      blank(item.originalAnimal),
      blank(item.effectiveAnimal),
      effectiveStatusLabel(item.status),
      actionForEffectiveStatus(item.status)
    ])
  ];

  const auditRows: (string | number)[][] = [
    ['Sequencia', 'Tag', 'Animal Original', 'Animal Observado', 'Animal Efetivo', 'Resultado', 'Decisao', 'Data/Hora', 'Origem NFC/Manual', 'Ocorrencia Relacionada'],
    ...ordered.map((record) => [
      record.sequence ?? '',
      blank(record.tagNumber),
      blank(record.expectedAnimal),
      blank(record.observedAnimal),
      blank(record.effectiveAnimal),
      statusLabel(record.status),
      fieldDecisionLabel(record.fieldDecision),
      formatDateTime(record.scannedAt),
      record.source === 'nfc' ? 'NFC' : 'Manual',
      blank(record.relatedRecordId ?? record.pairId)
    ])
  ];

  const pendingRows: (string | number)[][] = [
    ['Tipo', 'Tag', 'Animal original', 'Animal encontrado', 'Tag anterior', 'Tag nova', 'Motivo', 'Acao sugerida', 'Status'],
    ...current.filter((record) => record.status !== 'correct').map((record) => [
      record.status,
      blank(record.tagNumber),
      blank(record.expectedAnimal),
      blank(record.observedAnimal),
      '',
      blank(record.tagNumber),
      statusLabel(record.status),
      record.status === 'audit_conflict'
        ? 'Revisar leituras antes de corrigir o cadastro'
        : record.status === 'unconfirmed'
          ? 'Revisar em campo'
          : 'Corrigir cadastro no Nedap quando aplicavel',
      reviewLabel(record.reviewStatus)
    ]),
    ...effectiveAssignments.filter((item) => ['pending', 'not_found', 'displaced'].includes(item.status)).map((item) => [
      item.status,
      blank(item.tagNumber),
      blank(item.originalAnimal),
      blank(item.effectiveAnimal),
      item.status === 'displaced' ? blank(item.tagNumber) : '',
      '',
      effectiveStatusLabel(item.status),
      actionForEffectiveStatus(item.status),
      item.status === 'pending' ? 'Aberta' : 'Pendente'
    ])
  ];

  const preValidationRows: (string | number)[][] = [
    ['Tipo', 'Tag', 'Animal', 'Detalhe'],
    ...issues.map((issue) => [
      issue.type,
      blank(issue.tagNumber),
      blank(issue.animal),
      blank(issue.detail)
    ])
  ];

  const workbook = XLSX.utils.book_new();
  appendSheet(workbook, summaryRows, 'Resumo');
  appendSheet(workbook, finalRows.length > 1 ? finalRows : [...finalRows, ['Sem resultados', '', '', '', '']], 'Resultado Final');
  appendSheet(workbook, auditRows.length > 1 ? auditRows : [...auditRows, ['', '', '', '', '', 'Sem registros', '', '', '', '']], 'Auditoria');
  appendSheet(workbook, pendingRows.length > 1 ? pendingRows : [...pendingRows, ['Sem pendencias', '', '', '', '', '', '', '', '']], 'Pendencias');
  appendSheet(workbook, preValidationRows.length > 1 ? preValidationRows : [...preValidationRows, ['Sem inconsistencias', '', '', '']], 'Pre-validacao');

  const safeFarm = audit.farmName.replace(/[^a-zA-Z0-9_-]+/g, '_');
  XLSX.writeFile(workbook, `BIPTAG_${safeFarm}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function statusLabel(status: AuditRecord['status']) {
  const labels: Record<AuditRecord['status'], string> = {
    correct: 'Conferido',
    divergence: 'Tag encontrada em outro animal',
    reassignment: 'Tag reatribuida',
    linked: 'Tag vinculada em campo',
    new_tag: 'Nova tag cadastrada em campo',
    possible_swap: 'Possivel troca de tags',
    audit_conflict: 'Conflito de auditoria',
    replacement_chain: 'Cadeia de substituicoes',
    tag_not_registered: 'Tag nao cadastrada',
    tag_not_found: 'Tag nao localizada',
    tag_without_animal: 'Tag sem animal vinculado',
    animal_not_in_base: 'Animal fora da base',
    unconfirmed: 'Nao confirmado em campo',
    suspicious_tag: 'Tag suspeita',
    possible_typo: 'Possivel erro de digitacao'
  };
  return labels[status];
}

export function fieldDecisionLabel(decision: AuditRecord['fieldDecision']) {
  const labels: Record<AuditRecord['fieldDecision'], string> = {
    confirmed_match: 'Brinco e cadastro conferem',
    confirmed_physical_animal: 'Tecnico confirmou o brinco fisico',
    could_not_confirm: 'Tecnico nao conseguiu confirmar',
    review_later: 'Revisar depois'
  };
  return labels[decision];
}

export function reviewLabel(reviewStatus: AuditRecord['reviewStatus']) {
  if (reviewStatus === 'resolved') return 'Resolvido';
  if (reviewStatus === 'open') return 'Pendente';
  return 'Nao necessaria';
}
