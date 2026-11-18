import type { NotesWidgetProps } from './types';

declare const NotesWidget: {
  updateSnapshot(props: NotesWidgetProps): void;
  reload(): void;
};

export default NotesWidget;
