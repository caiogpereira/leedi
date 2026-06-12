// CPF/CNPJ validation (Brazilian taxpayer ids). Asaas requires a valid `cpfCnpj`
// to create a customer (CustomerSaveRequestDTO.required = [name, cpfCnpj]); an
// invalid value is rejected with HTTP 400, so we validate before calling Asaas.

/** Strip every non-digit character. */
export function normalizeCpfCnpj(value: string): string {
  return value.replace(/\D/g, '');
}

/** Digit at position i (charAt never returns undefined, keeping noUncheckedIndexedAccess happy). */
function digitAt(value: string, i: number): number {
  return Number(value.charAt(i));
}

function isValidCpf(cpf: string): boolean {
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false; // all-equal digits are invalid

  for (let pos = 9; pos < 11; pos++) {
    let sum = 0;
    for (let i = 0; i < pos; i++) {
      sum += digitAt(cpf, i) * (pos + 1 - i);
    }
    let check = (sum * 10) % 11;
    if (check === 10) check = 0;
    if (check !== digitAt(cpf, pos)) return false;
  }
  return true;
}

function isValidCnpj(cnpj: string): boolean {
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  const calc = (weights: number[]): number => {
    let sum = 0;
    weights.forEach((w, i) => {
      sum += digitAt(cnpj, i) * w;
    });
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  if (calc(weights1) !== digitAt(cnpj, 12)) return false;
  if (calc(weights2) !== digitAt(cnpj, 13)) return false;
  return true;
}

/** True when `value` is a structurally valid CPF (11 digits) or CNPJ (14 digits). */
export function isValidCpfCnpj(value: string | undefined | null): boolean {
  if (!value) return false;
  const digits = normalizeCpfCnpj(value);
  if (digits.length === 11) return isValidCpf(digits);
  if (digits.length === 14) return isValidCnpj(digits);
  return false;
}
