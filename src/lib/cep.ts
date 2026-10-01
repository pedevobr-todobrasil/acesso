export type CepResult = {
  cep: string
  street: string
  neighborhood: string
  city: string
  state: string
  complement: string
}

export async function lookupCep(rawCep: string): Promise<CepResult> {
  const cep = rawCep.replace(/\D/g, '')
  if (cep.length !== 8) throw new Error('Digite um CEP com 8 números.')
  const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
  if (!response.ok) throw new Error('Não foi possível consultar o CEP.')
  const data = await response.json()
  if (data.erro) throw new Error('CEP não encontrado.')
  return {
    cep: data.cep || rawCep,
    street: data.logradouro || '',
    neighborhood: data.bairro || '',
    city: data.localidade || '',
    state: data.uf || '',
    complement: data.complemento || '',
  }
}

export function normalizePlace(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
}
