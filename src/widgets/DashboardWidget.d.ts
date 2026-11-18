import type { DashboardWidgetProps } from './types';

declare const DashboardWidget: {
  updateSnapshot(props: DashboardWidgetProps): void;
  reload(): void;
};

export default DashboardWidget;
