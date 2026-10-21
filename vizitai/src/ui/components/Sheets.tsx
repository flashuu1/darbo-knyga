import { ActionSheet } from './ActionSheet';
import { AmountSheet } from './AmountSheet';
import { AppointmentSheet } from './AppointmentSheet';
import { DaySummarySheet } from './DaySummarySheet';
import { DragGhost } from './DragGhost';
import { MoveSheet } from './MoveSheet';
import { NewFlow } from './NewFlow';
import { ToastHost } from './Toast';
import { ClientCard } from '../screens/ClientCard';
import { usePresence } from '../presence';
import { ui, useStore, type Sheet } from '../store';

const keyOf = (s: Sheet) => (s.type === 'new' ? `new${s.start}${s.clientId ?? ''}${s.screen ?? ''}` : s.type === 'day' ? `day${s.date}` : `${s.type}${s.id}`);

export function Sheets() {
  const { sheet, client } = useStore(ui);
  // A closing sheet stays mounted for its exit animation (pointer-events off) and is then removed.
  const [shown, leaving] = usePresence<Sheet>(sheet);
  return (
    <>
      {client && <ClientCard id={client} />}
      {shown && (
        <div class="layer-host" data-leaving={leaving ? '' : undefined} key={keyOf(shown)}>
          {shown.type === 'new' && <NewFlow prefill={shown} />}
          {shown.type === 'appt' && <AppointmentSheet id={shown.id} />}
          {shown.type === 'move' && <MoveSheet id={shown.id} />}
          {shown.type === 'amount' && <AmountSheet id={shown.id} />}
          {shown.type === 'day' && <DaySummarySheet date={shown.date} />}
        </div>
      )}
      <ActionSheet />
      <DragGhost />
      <ToastHost />
    </>
  );
}
