import type { AuditRecord, KnownIssueType, OperationalAction, RecordStatus } from '../types/domain';

export function operationalActionLabel(action: OperationalAction | null | undefined) {
  const labels: Record<OperationalAction, string> = {
    keep_tag: 'MANTER TAG',
    remove_tag: 'REMOVER VINCULO',
    replace_tag: 'SUBSTITUIR TAG',
    register_new_tag: 'CADASTRAR TAG',
    link_tag: 'VINCULAR TAG',
    swap_tags: 'TROCAR TAGS',
    move_tag: 'MOVER TAG',
    tag_out_of_use: 'TAG FORA DE USO',
    investigate: 'INVESTIGAR'
  };
  return action ? labels[action] : '';
}

export function knownIssueLabel(type: KnownIssueType) {
  const labels: Record<KnownIssueType, string> = {
    never_sent_data: 'NEVER SENT DATA',
    stopped_sending: 'PAROU DE ENVIAR DADOS',
    without_linked_animal: 'SEM ANIMAL VINCULADO',
    reversed_collar: 'DE TRAS PARA FRENTE',
    tag_out_of_use: 'TAG FORA DE USO',
    other: 'OUTRO'
  };
  return labels[type];
}

export function knownIssueActionLabel(type: KnownIssueType) {
  const labels: Record<KnownIssueType, string> = {
    never_sent_data: 'INVESTIGAR',
    stopped_sending: 'INVESTIGAR',
    without_linked_animal: 'VINCULAR TAG',
    reversed_collar: 'INVERTER O COLAR',
    tag_out_of_use: 'TAG FORA DE USO',
    other: 'INVESTIGAR'
  };
  return labels[type];
}

export function statusLabel(status: RecordStatus) {
  const labels: Record<RecordStatus, string> = {
    correct: 'Tag correta',
    divergence: 'Tag movimentada',
    reassignment: 'Tag movimentada',
    linked: 'Tag vinculada',
    new_tag: 'Nova tag',
    new_tag_conflict: 'Conflito para revisao',
    possible_swap: 'Troca identificada',
    audit_conflict: 'Conflito para revisao',
    replacement_chain: 'Cadeia de substituicoes',
    tag_not_registered: 'Tag nao cadastrada',
    tag_not_found: 'Tag nao localizada',
    tag_without_animal: 'Tag sem vinculo',
    tag_stored: 'Tag sem animal',
    animal_without_ear_tag: 'Animal sem brinco',
    animal_not_in_base: 'Animal fora da base',
    unconfirmed: 'Nao confirmada',
    suspicious_tag: 'Tag suspeita',
    possible_typo: 'Possivel erro de cadastro'
  };
  return labels[status];
}

export function fieldDecisionLabel(decision: AuditRecord['fieldDecision']) {
  const labels: Record<AuditRecord['fieldDecision'], string> = {
    confirmed_match: 'Brinco e cadastro conferem',
    confirmed_physical_animal: 'Tecnico confirmou o brinco fisico',
    could_not_confirm: 'Tecnico nao conseguiu confirmar',
    tag_without_animal: 'Tecnico confirmou tag sem animal',
    animal_without_ear_tag: 'Tecnico confirmou animal sem brinco',
    review_later: 'Revisar depois'
  };
  return labels[decision];
}
