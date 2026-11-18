import type { HabitsWidgetProps } from './types';

declare const HabitsWidget: {
  updateSnapshot(props: HabitsWidgetProps): void;
  reload(): void;
};

export default HabitsWidget;
