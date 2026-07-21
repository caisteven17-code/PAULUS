export const PASSWORD_REQUIREMENTS = [
  { key: 'length', label: 'At least 8 characters', test: (password: string) => password.length >= 8 },
  { key: 'uppercase', label: 'One uppercase letter', test: (password: string) => /[A-Z]/.test(password) },
  { key: 'lowercase', label: 'One lowercase letter', test: (password: string) => /[a-z]/.test(password) },
  { key: 'number', label: 'One number', test: (password: string) => /\d/.test(password) },
  {
    key: 'special',
    label: 'One special character (for example: ! @ # $ %)',
    test: (password: string) => /[^A-Za-z0-9\s]/.test(password),
  },
] as const;

export const getPasswordRequirementState = (password: string) =>
  PASSWORD_REQUIREMENTS.map((requirement) => ({
    ...requirement,
    met: requirement.test(password),
  }));

export const passwordMeetsPolicy = (password: string) =>
  PASSWORD_REQUIREMENTS.every((requirement) => requirement.test(password));
