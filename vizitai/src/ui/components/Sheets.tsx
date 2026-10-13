import { NewSheet } from './NewSheet';
import { ui, useStore } from '../store';

export function Sheets() {
  const { sheet } = useStore(ui);
  if (sheet?.type === 'new') return <NewSheet key={`${sheet.start}${sheet.clientId ?? ''}`} prefill={sheet} />;
  return null;
}
