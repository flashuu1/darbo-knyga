import { ActionSheet } from './ActionSheet';
import { AppointmentSheet } from './AppointmentSheet';
import { DragGhost } from './DragGhost';
import { NewSheet } from './NewSheet';
import { ToastHost } from './Toast';
import { ClientCard } from '../screens/ClientCard';
import { ui, useStore } from '../store';

export function Sheets() {
  const { sheet, client } = useStore(ui);
  return (
    <>
      {client && <ClientCard id={client} />}
      {sheet?.type === 'new' && <NewSheet key={`${sheet.start}${sheet.clientId ?? ''}`} prefill={sheet} />}
      {sheet?.type === 'appt' && <AppointmentSheet key={sheet.id} id={sheet.id} />}
      <ActionSheet />
      <DragGhost />
      <ToastHost />
    </>
  );
}
