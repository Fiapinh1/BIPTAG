import type { AuditRecord, OperationalAction, RecordStatus } from '../types/domain';

export function operationalActionLabel(action: OperationalAction | null | undefined) {
  const labels: Record<OperationalAction, string> = {
    keep_tag: 'MANTER TAG',
    remove_tag: 'REMOVER VINCULO',
    replace_tag: 'SUBSTITUIR TAG',
    register_new_tag: 'CADASTRAR TAG',
    link_tag: 'VINCULAR TAG',
    swap_tags: 'TROCAR TAGS',
    move_tag: 'MOVER TAG',
    investigate: 'INVESTIGAR'
  };
  return action ? labels[action] : '';
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
    review_later: 'Revisar depois'
  };
  return labels[decision];
}
