interface Language {
  code: string;
  label: string;
}

interface LanguageSelectorProps {
  languages: Language[];
  value: string;
  onChange: (code: string) => void;
}

function LanguageSelector({ languages, value, onChange }: LanguageSelectorProps) {
  return (
    <select
      className="language-selector"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {languages.map((lang) => (
        <option key={lang.code} value={lang.code}>
          {lang.label}
        </option>
      ))}
    </select>
  );
}

export default LanguageSelector;
