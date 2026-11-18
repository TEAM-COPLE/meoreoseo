import type { EventsWidgetProps } from './types';

declare const EventsWidget: {
  updateSnapshot(props: EventsWidgetProps): void;
  reload(): void;
};

export default EventsWidget;
