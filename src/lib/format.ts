export const formatBRL = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

export const statusLabel: Record<string, string> = {
  pending: 'Novo',
  accepted: 'Aceito',
  preparing: 'Preparando',
  out_for_delivery: 'Saiu para entrega',
  ready: 'Pronto para retirada',
  completed: 'Finalizado',
  cancelled: 'Cancelado',
}
