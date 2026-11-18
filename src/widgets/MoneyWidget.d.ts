import type { MoneyWidgetProps } from './types';

declare const MoneyWidget: {
  updateSnapshot(props: MoneyWidgetProps): void;
  reload(): void;
};

export default MoneyWidget;
