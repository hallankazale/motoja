import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../lib/theme';

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const label = theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro';
  return <button type="button" className={`theme-toggle ${className}`} onClick={toggle} aria-label={label} title={label}>
    {theme === 'dark' ? <Sun size={23} /> : <Moon size={22} />}
  </button>;
}
