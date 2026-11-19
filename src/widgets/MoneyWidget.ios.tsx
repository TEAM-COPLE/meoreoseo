import { HStack, ProgressView, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import {
    background,
    containerBackground,
    cornerRadius,
    font,
    foregroundStyle,
    frame,
    padding,
    tint,
    widgetURL,
} from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

import { INITIAL_MONEY_WIDGET_PROPS, type MoneyWidgetProps } from "./types";

function MoneyWidgetLayout(
  props: MoneyWidgetProps,
  environment: WidgetEnvironment,
) {
  "widget";

  const isDark = (environment.colorScheme ?? props.colorScheme) === "dark";
  const c = isDark
    ? {
        bg: "#1F1E2E",
        surface: "#2B2A40",
        text: "#F5F5FA",
        textSecondary: "#8F8FA8",
        tint: "#9B8AFB",
        tintSoft: "#282447",
        danger: "#FF7B8B",
        success: "#4ADE80",
      }
    : {
        bg: "#FFFFFF",
        surface: "#F4F5FA",
        text: "#171626",
        textSecondary: "#6B6C84",
        tint: "#6354EA",
        tintSoft: "#EEECFD",
        danger: "#D92D46",
        success: "#0E9F6E",
      };

  return (
    <VStack
      alignment="leading"
      spacing={10}
      modifiers={[
        padding({ all: 14 }),
        frame({
          maxWidth: Infinity,
          maxHeight: Infinity,
          alignment: "topLeading",
        }),
        containerBackground(c.bg, "widget"),
        widgetURL("meoreoseo://money"),
      ]}
    >
      <HStack spacing={6}>
        <Text
          modifiers={[
            font({ size: 15, weight: "bold" }),
            foregroundStyle(c.text),
          ]}
        >
          {props.monthLabel}
        </Text>
        <Spacer />
        <Text
          modifiers={[
            font({ size: 11, weight: "semibold" }),
            foregroundStyle(c.tint),
            padding({ horizontal: 7, vertical: 2 }),
            background(c.tintSoft),
            cornerRadius(99),
          ]}
        >
          {`오늘 ${props.todayExpenseLabel}`}
        </Text>
      </HStack>

      <HStack spacing={8}>
        <VStack
          alignment="leading"
          spacing={2}
          modifiers={[
            padding({ all: 10 }),
            frame({ maxWidth: Infinity, alignment: "leading" }),
            background(c.surface),
            cornerRadius(12),
          ]}
        >
          <Text
            modifiers={[font({ size: 11 }), foregroundStyle(c.textSecondary)]}
          >
            지출
          </Text>
          <Text
            modifiers={[
              font({ size: 15, weight: "bold" }),
              foregroundStyle(c.danger),
            ]}
          >
            {props.expenseLabel}
          </Text>
        </VStack>

        <VStack
          alignment="leading"
          spacing={2}
          modifiers={[
            padding({ all: 10 }),
            frame({ maxWidth: Infinity, alignment: "leading" }),
            background(c.surface),
            cornerRadius(12),
          ]}
        >
          <Text
            modifiers={[font({ size: 11 }), foregroundStyle(c.textSecondary)]}
          >
            수입
          </Text>
          <Text
            modifiers={[
              font({ size: 15, weight: "bold" }),
              foregroundStyle(c.success),
            ]}
          >
            {props.incomeLabel}
          </Text>
        </VStack>
      </HStack>

      {props.budgetLabel ? (
        <VStack alignment="leading" spacing={4}>
          <Text
            modifiers={[
              font({ size: 11, weight: "semibold" }),
              foregroundStyle(props.isOverBudget ? c.danger : c.textSecondary),
            ]}
          >
            {props.budgetLabel}
          </Text>
          {props.budgetProgress >= 0 ? (
            <ProgressView
              value={props.budgetProgress}
              modifiers={[tint(props.isOverBudget ? c.danger : c.tint)]}
            />
          ) : null}
        </VStack>
      ) : null}
    </VStack>
  );
}

export default createWidget<MoneyWidgetProps>(
  "MoneyWidget",
  MoneyWidgetLayout,
  INITIAL_MONEY_WIDGET_PROPS,
);
