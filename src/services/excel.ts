import * as XLSX from 'xlsx';
import type { Audit, AuditRecord, ImportIssue, ImportPreview, RecordStatus, TagAssignment } from '../types/domain';

const REQUIRED_HEADERS = ['Numero de tag', 'Animal'];

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

export async function parseNedapWorkbook(file: File): Promise<ImportPreview> {
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

  const assignments: Omit<TagAssignment, 'id' | 'auditId'>[] = [];

  for (const row of rows) {
    const tagNumber = normalizeTag(getValue(row, 'Numero de tag'));
    if (!tagNumber) continue;

    assignments.push({
      tagNumber,
      functionName: text(getValue(row, 'Funcao')),
      typeName: text(getValue(row, 'Tipo')),
      expectedAnimal: text(getValue(row, 'Animal')),
      connectedSince: text(getValue(row, 'Conectado desde')),
      lastDetectedAt: text(getValue(row, 'Ultimo detetado')),
      lastDetectedFarm: text(getValue(row, 'Detectado pela ultima vez na fazenda'))
    });
  }

  const issues: ImportPreview['issues'] = [];
  const tagMap = new Map<string, number>();
  const animalMap = new Map<string, Set<string>>();

  for (const item of assignments) {
    tagMap.set(item.tagNumber, (tagMap.get(item.tagNumber) ?? 0) + 1);

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

  return {
    assignments,
    issues,
    stats: {
      totalTags: assignments.length,
      linkedTags: assignments.filter((item) => Boolean(item.expectedAnimal)).length,
      tagsWithoutAnimal: issues.filter((item) => item.type === 'tag_without_animal').length,
      duplicateTags: issues.filter((item) => item.type === 'duplicate_tag').length,
      animalsWithMultipleTags: issues.filter((item) => item.type === 'multiple_tags_same_animal').length
    }
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

function percent(done: number, total: number) {
  return total ? `${Math.min(Math.round((done / total) * 100), 100)}%` : '0%';
}

function appendSheet(workbook: XLSX.WorkBook, rows: (string | number)[][], name: string) {
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
}

export function exportAuditWorkbook(audit: Audit, records: AuditRecord[], issues: ImportIssue[]) {
  const ordered = chronological(records);
  const current = records.filter((record) => record.isCurrent !== false);
  const auditedUnique = new Set(current.map((record) => record.tagNumber)).size;
  const pending = Math.max(audit.totalTags - auditedUnique, 0);

  const summaryRows: (string | number)[][] = [
    ['Campo', 'Valor'],
    ['Fazenda', blank(audit.farmName)],
    ['Data de inicio', formatDateTime(audit.startedAt)],
    ['Data de conclusao', audit.finishedAt ? formatDateTime(audit.finishedAt) : ''],
    ['Total de tags da base', audit.totalTags],
    ['Conferidas', auditedUnique],
    ['Corretas', countStatus(current, 'correct')],
    ['Divergencias confirmadas', countStatus(current, 'divergence')],
    ['Tags nao cadastradas', countStatus(current, 'tag_not_registered') + countStatus(current, 'tag_not_found')],
    ['Tags sem vinculo', countStatus(current, 'tag_without_animal')],
    ['Animais fora da base', countStatus(current, 'animal_not_in_base')],
    ['Nao confirmadas', countStatus(current, 'unconfirmed')],
    ['Possiveis trocas', countStatus(current, 'possible_swap')],
    ['Pendentes', pending],
    ['Percentual concluido', percent(auditedUnique, audit.totalTags)]
  ];

  const auditRows: (string | number)[][] = [
    ['Sequencia', 'Animal Esperado', 'Animal Observado', 'Tag', 'Status', 'Decisao em Campo', 'Revisao', 'Possivel Troca', 'Observacao', 'Data/Hora', 'Origem'],
    ...ordered.map((record) => [
      record.sequence ?? '',
      blank(record.expectedAnimal),
      blank(record.observedAnimal),
      blank(record.tagNumber),
      statusLabel(record.status),
      fieldDecisionLabel(record.fieldDecision),
      reviewLabel(record.reviewStatus),
      record.pairId ? 'Sim' : 'Nao',
      blank(record.note),
      formatDateTime(record.scannedAt),
      record.source === 'nfc' ? 'NFC' : 'Manual'
    ])
  ];

  const issueRows: (string | number)[][] = [
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
  appendSheet(workbook, auditRows.length > 1 ? auditRows : [...auditRows, ['', '', '', '', 'Sem registros', '', '', '', '', '', '']], 'Auditoria');
  appendSheet(workbook, issueRows.length > 1 ? issueRows : [...issueRows, ['Sem inconsistencias', '', '', '']], 'Pré-validação');

  const safeFarm = audit.farmName.replace(/[^a-zA-Z0-9_-]+/g, '_');
  XLSX.writeFile(workbook, `BIPTAG_${safeFarm}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function statusLabel(status: AuditRecord['status']) {
  const labels: Record<AuditRecord['status'], string> = {
    correct: 'Conferido',
    divergence: 'Tag encontrada em outro animal',
    possible_swap: 'Possivel troca de tags',
    tag_not_registered: 'Tag nao cadastrada',
    tag_not_found: 'Tag nao cadastrada',
    tag_without_animal: 'Tag sem animal vinculado',
    animal_not_in_base: 'Animal fora da base',
    unconfirmed: 'Nao confirmado em campo'
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
