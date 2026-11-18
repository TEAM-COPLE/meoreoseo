import type { TodoWidgetProps } from './types';

declare const TodoWidget: {
  updateSnapshot(props: TodoWidgetProps): void;
  reload(): void;
};

export default TodoWidget;
