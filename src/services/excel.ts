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
    confirmed: 'MANTER TAG',
    reassigned: 'MOVER TAG',
    linked: 'VINCULAR TAG',
    new_tag: 'CADASTRAR TAG',
    displaced: 'INVESTIGAR',
    not_found: 'INVESTIGAR',
    suspicious: 'INVESTIGAR',
    invalid: 'INVESTIGAR',
    unresolved: 'INVESTIGAR'
  };
  return actions[status];
}

function actionNeeded(record: AuditRecord) {
  if (record.operationalAction) return operationalActionLabel(record.operationalAction);
  if (record.status === 'possible_swap') return 'TROCAR TAGS';
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

export function exportAuditWorkbook(
  audit: Audit,
  records: AuditRecord[],
  issues: ImportIssue[],
  effectiveAssignments: EffectiveTagAssignment[] = [],
  knownIssues: KnownIssue[] = [],
  assignments: TagAssignment[] = []
) {
  const ordered = chronological(records);
  const confirmed = ordered.filter((record) =>
    Boolean(record.observedAnimal) &&
    (record.fieldDecision === 'confirmed_physical_animal' || record.fieldDecision === 'confirmed_match')
  );
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
  const latestEffective = new Map(validEffective.map((item) => [item.tagNumber, item]));
  const swapRecords = latestConfirmed.filter((record) => record.status === 'possible_swap' && record.pairId);
  const swapGroups = new Map<string, AuditRecord[]>();
  for (const record of swapRecords) {
    const group = swapGroups.get(record.pairId!) ?? [];
    group.push(record);
    swapGroups.set(record.pairId!, group);
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

  for (const item of validEffective) {
    const record = latestConfirmedByTag.get(item.tagNumber);
    if (!record || record.status === 'possible_swap') continue;
    if (record.operationalAction === 'remove_tag') {
      actionRows.push(['REMOVER VÍNCULO', blank(item.tagNumber), blank(record.expectedAnimal ?? record.observedAnimal), 'SEM ANIMAL', blank(record.expectedAnimal ?? record.observedAnimal), blank(record.actionNote ?? record.note)]);
      continue;
    }
    if (record.operationalAction === 'replace_tag') {
      actionRows.push(['SUBSTITUIR TAG', blank(item.tagNumber), blank(record.expectedAnimal ?? record.observedAnimal), 'NOVA TAG', blank(record.expectedAnimal ?? record.observedAnimal), blank(record.actionNote ?? record.note)]);
      continue;
    }
    if (item.status === 'reassigned' && record.expectedAnimal && record.observedAnimal && record.expectedAnimal !== record.observedAnimal) {
      actionRows.push(['MOVER TAG', blank(item.tagNumber), blank(record.expectedAnimal), blank(record.observedAnimal), blank(record.observedAnimal), blank(record.actionNote ?? record.note)]);
    } else if (item.status === 'linked' || (item.status === 'reassigned' && !record.expectedAnimal)) {
      actionRows.push(['VINCULAR TAG', blank(item.tagNumber), 'SEM ANIMAL', blank(record.observedAnimal), blank(record.observedAnimal), blank(record.actionNote ?? record.note)]);
    } else if (item.status === 'new_tag') {
      actionRows.push(['CADASTRAR TAG', blank(item.tagNumber), 'SEM CADASTRO', blank(record.observedAnimal), blank(record.observedAnimal), blank(record.actionNote ?? record.note)]);
    } else if (item.status === 'displaced') {
      actionRows.push(['REMOVER VÍNCULO', blank(item.tagNumber), blank(item.originalAnimal), 'SEM ANIMAL', blank(item.originalAnimal), 'Animal ficou sem tag confirmada nesta auditoria.']);
    }
  }
  for (const record of latestConfirmed.filter((item) => item.status === 'possible_typo')) {
    const match = safeTypoMatch(record);
    if (match) {
      actionRows.push(['CORRIGIR TAG', blank(match.tagNumber), blank(match.tagNumber), blank(record.tagNumber), blank(record.observedAnimal), 'Relação confirmada em campo; corrigir o cadastro da SmartTag.']);
    }
  }

  const reviewRows: (string | number)[][] = [
    ['TIPO', 'TAG', 'ANIMAL / CONTEXTO', 'O QUE ACONTECEU', 'ÚLTIMA EVIDÊNCIA CONFIRMADA', 'AÇÃO SUGERIDA']
  ];
  for (const record of latestUnconfirmed) {
    const confirmedRecord = latestConfirmedByTag.get(record.tagNumber);
    reviewRows.push(['NÃO CONFIRMADA', blank(record.tagNumber), blank(record.observedAnimal ?? record.expectedAnimal), `Tentativa: ${blank(record.observedAnimal)}`, blank(confirmedRecord?.observedAnimal), 'INVESTIGAR']);
  }
  for (const record of latestConfirmed.filter((item) => ['audit_conflict', 'new_tag_conflict'].includes(item.status))) {
    reviewRows.push(['CONFLITO', blank(record.tagNumber), blank(record.observedAnimal ?? record.expectedAnimal), blank(record.note ?? record.actionNote), blank(latestConfirmedByTag.get(record.tagNumber)?.observedAnimal), 'INVESTIGAR']);
  }
  for (const item of effectiveAssignments.filter((entry) => ['not_found', 'displaced', 'unresolved', 'suspicious', 'invalid'].includes(entry.status))) {
    const record = latestConfirmedByTag.get(item.tagNumber);
    reviewRows.push([
      item.status === 'not_found' ? 'TAG NÃO LOCALIZADA' : item.status === 'displaced' ? 'ANIMAL SEM TAG' : 'SITUAÇÃO AMBÍGUA',
      blank(item.tagNumber),
      blank(item.effectiveAnimal ?? item.originalAnimal),
      blank(record?.note ?? record?.actionNote),
      blank(record?.observedAnimal),
      'INVESTIGAR'
    ]);
  }
  for (const issue of knownIssues) reviewRows.push(['PROBLEMA CONHECIDO', blank(issue.tagNumber), '', blank(issue.note), '', 'INVESTIGAR']);
  for (const issue of issues.filter((item) => ['possible_typo', 'suspicious_tag', 'invalid_tag'].includes(item.type))) reviewRows.push(['CADASTRO SUSPEITO', blank(issue.tagNumber), blank(issue.animal), blank(issue.detail), '', 'INVESTIGAR']);

  const conferenceRows: (string | number)[][] = [
    ['SEQUÊNCIA', 'DATA/HORA', 'TAG', 'ANIMAL NEDAP', 'ANIMAL OBSERVADO', 'CONFIRMADO?', 'ORIGEM', 'DECISÃO'],
    ...ordered.map((record) => [
      record.sequence ?? '',
      formatDateTime(record.scannedAt),
      blank(record.tagNumber),
      blank(record.expectedAnimal),
      blank(record.observedAnimal),
      record.fieldDecision === 'confirmed_physical_animal' || record.fieldDecision === 'confirmed_match' ? 'SIM' : 'NÃO',
      record.source === 'nfc' ? 'NFC' : 'Manual',
      record.status === 'unconfirmed' ? 'NÃO CONFIRMADA' : record.status === 'correct' ? 'CORRETA' : record.status === 'possible_typo' ? 'CORRIGIR TAG' : record.status === 'possible_swap' ? 'TROCAR TAGS' : record.status === 'reassignment' || record.status === 'divergence' ? 'MOVER TAG' : record.status === 'linked' || record.status === 'tag_without_animal' ? 'VINCULAR TAG' : 'REVISAR'
    ])
  ];

  const correctCount = latestConfirmed.filter((record) => record.status === 'correct').length;
  const actionCount = actionRows.length - 1;
  const reviewCount = reviewRows.length - 1;
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
    ['Tags novas', latestConfirmed.filter((record) => ['new_tag', 'tag_not_registered'].includes(record.status)).length],
    ['Tags não localizadas', effectiveAssignments.filter((item) => item.status === 'not_found').length],
    ['Animais sem tag', effectiveAssignments.filter((item) => item.status === 'displaced').length],
    ['Registros suspeitos', (audit.suspiciousTags ?? 0) + issues.filter((item) => ['possible_typo', 'suspicious_tag', 'invalid_tag'].includes(item.type)).length]
  ];

  const workbook = XLSX.utils.book_new();
  appendSheet(workbook, actionRows, 'CORRIGIR NO NEDAP');
  appendSheet(workbook, reviewRows, 'REVISAR');
  appendSheet(workbook, conferenceRows, 'CONFERÊNCIA');
  appendSheet(workbook, summaryRows, 'RESUMO');

  const safeFarm = audit.farmName.replace(/[^a-zA-Z0-9_-]+/g, '_');
  XLSX.writeFile(workbook, `BIPTAG_${safeFarm}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function reviewLabel(reviewStatus: AuditRecord['reviewStatus']) {
  if (reviewStatus === 'resolved') return 'Resolvido';
  if (reviewStatus === 'open') return 'Pendente';
  return 'Nao necessaria';
}
