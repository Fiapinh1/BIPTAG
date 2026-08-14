import * as XLSX from 'xlsx';
import type { AuditRecord, ImportPreview, TagAssignment } from '../types/domain';

const REQUIRED_HEADERS = ['Número de tag', 'Animal'];

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

export async function parseNedapWorkbook(file: File): Promise<ImportPreview> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', raw: false, cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  if (!sheet) {
    throw new Error('A planilha não possui nenhuma aba legível.');
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: false
  });

  if (!rows.length) {
    throw new Error('A planilha está vazia.');
  }

  const headers = Object.keys(rows[0]).map(normalizeHeader);
  for (const required of REQUIRED_HEADERS) {
    if (!headers.includes(normalizeHeader(required))) {
      throw new Error(`Coluna obrigatória não encontrada: ${required}`);
    }
  }

  const assignments: Omit<TagAssignment, 'id' | 'auditId'>[] = [];

  for (const row of rows) {
    const tagNumber = normalizeTag(getValue(row, 'Número de tag'));
    if (!tagNumber) continue;

    assignments.push({
      tagNumber,
      functionName: text(getValue(row, 'Função')),
      typeName: text(getValue(row, 'Tipo')),
      expectedAnimal: text(getValue(row, 'Animal')),
      connectedSince: text(getValue(row, 'Conectado desde')),
      lastDetectedAt: text(getValue(row, 'Último detetado')),
      lastDetectedFarm: text(getValue(row, 'Detectado pela última vez na fazenda'))
    });
  }

  const issues: ImportPreview['issues'] = [];
  const tagMap = new Map<string, number>();
  const animalMap = new Map<string, string[]>();

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
      const list = animalMap.get(item.expectedAnimal) ?? [];
      list.push(item.tagNumber);
      animalMap.set(item.expectedAnimal, list);
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
    if (tags.length > 1) {
      issues.push({
        type: 'multiple_tags_same_animal',
        tagNumber: null,
        animal,
        detail: `Animal ${animal} possui ${tags.length} tags: ${tags.join(', ')}.`
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
      animalsWithMultipleTags: issues.filter(
        (item) => item.type === 'multiple_tags_same_animal'
      ).length
    }
  };
}

export function exportAuditWorkbook(
  farmName: string,
  records: AuditRecord[],
  issues: { type: string; tagNumber: string | null; animal: string | null; detail: string }[]
) {
  const reportRows = records.map((record) => ({
    'Animal Esperado': record.expectedAnimal ?? '',
    'Animal Observado': record.observedAnimal ?? '',
    Tag: record.tagNumber,
    Status: statusLabel(record.status),
    'Decisão em campo': fieldDecisionLabel(record.fieldDecision),
    'Revisão': record.reviewStatus === 'resolved' ? 'Resolvido' : record.reviewStatus === 'open' ? 'Pendente' : 'Não necessária',
    'Possível troca': record.pairId ? 'Sim' : 'Não',
    Observação: record.note ?? '',
    Data: new Date(record.scannedAt).toLocaleString('pt-BR'),
    Origem: record.source === 'nfc' ? 'NFC' : 'Manual'
  }));

  const issueRows = issues.map((issue) => ({
    Tipo: issue.type,
    Tag: issue.tagNumber ?? '',
    Animal: issue.animal ?? '',
    Detalhe: issue.detail
  }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(reportRows.length ? reportRows : [{ Status: 'Sem registros' }]),
    'Auditoria'
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(issueRows.length ? issueRows : [{ Status: 'Sem inconsistências' }]),
    'Pré-validação'
  );

  const safeFarm = farmName.replace(/[^a-zA-Z0-9_-]+/g, '_');
  XLSX.writeFile(workbook, `BIPTAG_${safeFarm}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function statusLabel(status: AuditRecord['status']) {
  const labels: Record<AuditRecord['status'], string> = {
    correct: 'Conferido',
    divergence: 'Tag encontrada em outro animal',
    possible_swap: 'Possível troca de tags',
    tag_not_found: 'Tag não cadastrada',
    tag_without_animal: 'Tag sem animal vinculado',
    animal_not_in_base: 'Animal fora da base',
    unconfirmed: 'Não confirmado em campo'
  };
  return labels[status];
}

export function fieldDecisionLabel(decision: AuditRecord['fieldDecision']) {
  const labels: Record<AuditRecord['fieldDecision'], string> = {
    confirmed_match: 'Brinco e cadastro conferem',
    confirmed_physical_animal: 'Técnico confirmou o brinco físico',
    could_not_confirm: 'Técnico não conseguiu confirmar',
    review_later: 'Revisar depois'
  };
  return labels[decision];
}
