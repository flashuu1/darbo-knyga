import { ActionSheet } from './ActionSheet';
import { AppointmentSheet } from './AppointmentSheet';
import { NewSheet } from './NewSheet';
import { ToastHost } from './Toast';
import { ui, useStore } from '../store';

export function Sheets() {
  const { sheet } = useStore(ui);
  return (
    <>
      {sheet?.type === 'new' && <NewSheet key={`${sheet.start}${sheet.clientId ?? ''}`} prefill={sheet} />}
      {sheet?.type === 'appt' && <AppointmentSheet key={sheet.id} id={sheet.id} />}
      <ActionSheet />
      <ToastHost />
    </>
  );
}
