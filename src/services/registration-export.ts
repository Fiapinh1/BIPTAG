import * as XLSX from 'xlsx';
import type { RegisteredTag, RegistrationFarm } from '../types/registration';

export function createRegistrationWorkbook(farm: RegistrationFarm, records: RegisteredTag[]) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ['BIPTAG — CADASTRO DE TAGS'], ['Fazenda', farm.name], [],
    ['SMARTTAG', 'ANIMAL', 'DATA DO CADASTRO'],
    ...[...records].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((record) => [
      record.tagNumber, record.animal, new Date(record.createdAt).toLocaleString('pt-BR')
    ])
  ]);
  sheet['!cols'] = [{ wch: 24 }, { wch: 24 }, { wch: 25 }];
  sheet['!autofilter'] = { ref: `A4:C${Math.max(4, records.length + 4)}` };
  XLSX.utils.book_append_sheet(workbook, sheet, 'CADASTRO DE TAGS');
  return workbook;
}

export function exportRegistrationWorkbook(farm: RegistrationFarm, records: RegisteredTag[]) {
  const safeName = farm.name.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'Fazenda';
  XLSX.writeFile(createRegistrationWorkbook(farm, records), `Cadastro_Tags_${safeName}.xlsx`);
}
