import { useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { RegistrationFarm } from '../types/registration';
import { DEFAULT_MANUAL_PATTERN, manualPatternError, parseManualRegistrationTag, saveRegistrationPattern } from '../services/registration-pattern';
import { SettingsIcon } from '../icons/Icons';

export function RegistrationManualTag({ farm, value, disabled, inputRef, onChange, onError }: {
  farm: RegistrationFarm;
  value: string;
  disabled: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onChange: (value: string) => void;
  onError: (message: string) => void;
}) {
  const pattern = farm.manualTagPattern ?? DEFAULT_MANUAL_PATTERN;
  const suffixLength = pattern.length - pattern.prefix.length;
  const matchesPrefix = !value || value.startsWith(pattern.prefix);
  const suffix = matchesPrefix && pattern.prefix ? value.slice(pattern.prefix.length) : value;
  const [open, setOpen] = useState(false);
  const [prefix, setPrefix] = useState(pattern.prefix);
  const [length, setLength] = useState(String(pattern.length));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (open) {
      setPrefix(pattern.prefix); setLength(String(pattern.length)); setError('');
      if (!dialog.current?.open) dialog.current?.showModal();
    } else dialog.current?.close();
  }, [open]);

  function input(value: string) {
    try { onChange(parseManualRegistrationTag(value, pattern)); }
    catch (err) { onError(err instanceof Error ? err.message : 'Confira o número da tag.'); }
  }

  async function savePattern() {
    const next = { prefix, length: Number(length), numericOnly: true };
    const invalid = manualPatternError(next);
    if (invalid) { setError(invalid); return; }
    setSaving(true); setError('');
    try { await saveRegistrationPattern(farm.id, next); setOpen(false); }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível salvar o padrão.'); }
    finally { setSaving(false); }
  }

  return <>
    <div className="registration-manual-pattern"><span><strong>Formato da SmartTag</strong><small>{pattern.length} dígitos no total</small></span><button type="button" disabled={disabled} onClick={() => setOpen(true)} aria-haspopup="dialog"><SettingsIcon size={17} />Padrão manual</button></div>
    <div className={`registration-manual-input ${pattern.prefix ? 'has-prefix' : ''}`}>
    {pattern.prefix && <span className="registration-prefix" aria-label={`Prefixo fixo ${pattern.prefix}`}><small>Início fixo</small><strong>{pattern.prefix}</strong></span>}
    <input ref={inputRef} id="new-registration-tag" className="text-input registration-tag-input" placeholder={pattern.prefix ? `${suffixLength} ${suffixLength === 1 ? 'dígito final' : 'dígitos finais'}` : 'Número completo da tag'}
      aria-label={pattern.prefix ? 'Dígitos finais da SmartTag' : 'SmartTag'} aria-describedby="registration-manual-hint" inputMode="numeric" pattern={`[0-9]{${suffixLength}}`} maxLength={suffixLength} autoComplete="off" required
      value={suffix} disabled={disabled} onChange={(event) => input(event.target.value)} onPaste={(event) => { event.preventDefault(); input(event.clipboardData.getData('text')); }} />
    </div>
    <small id="registration-manual-hint" className="registration-field-hint">{pattern.prefix ? `Digite apenas ${suffixLength === 1 ? 'o dígito final' : `os ${suffixLength} dígitos finais`}. O prefixo já está preenchido.` : `Digite os ${pattern.length} dígitos da etiqueta.`} Você também pode colar a tag completa.</small>
    {value && <div className={`registration-composed-tag ${matchesPrefix && value.length === pattern.length ? 'is-complete' : ''}`}><span>Tag completa</span><strong>{value}</strong><small>{value.length}/{pattern.length} dígitos</small></div>}
    {createPortal(<dialog className="registration-pattern-dialog" ref={dialog} aria-labelledby="registration-pattern-title" onCancel={() => setOpen(false)} onClose={() => setOpen(false)}>
      <form onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); void savePattern(); }}>
        <div className="app-modal__header"><h2 id="registration-pattern-title">Padrão do lançamento manual</h2><button className="app-modal__close" type="button" disabled={saving} aria-label="Fechar padrão manual" onClick={() => setOpen(false)}>×</button></div>
        <p>Configure uma vez para esta fazenda e digite só o que muda em cada tag.</p>
        <label htmlFor="registration-pattern-prefix">Prefixo inicial</label><input autoFocus className="text-input" id="registration-pattern-prefix" placeholder="Ex.: 9840000" inputMode="numeric" maxLength={29} value={prefix} disabled={saving} onChange={(event) => { setPrefix(event.target.value.replace(/[^0-9]/g, '')); setError(''); }} />
        <small>Deixe vazio para digitar o número completo.</small>
        <label htmlFor="registration-pattern-length">Quantidade total de dígitos</label><input className="text-input" id="registration-pattern-length" inputMode="numeric" pattern="[0-9]+" maxLength={2} value={length} required disabled={saving} onChange={(event) => { setLength(event.target.value.replace(/[^0-9]/g, '')); setError(''); }} />
        <small>De 1 a 30, contando o prefixo inicial.</small>
        {value && <p className="registration-notice">A tag em preenchimento será mantida. Confira se ela corresponde ao novo padrão antes de salvar o vínculo.</p>}
        {error && <p role="alert" className="registration-error">{error}</p>}
        <button className="button button--primary button--full" disabled={saving}>{saving ? 'Salvando…' : 'Salvar padrão manual'}</button>
      </form>
    </dialog>, document.body)}
  </>;
}
