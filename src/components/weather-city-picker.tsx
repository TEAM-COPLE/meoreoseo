import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSearchPlaces } from '@/hooks/use-weather';
import type { City } from '@/lib/weather';

type Props = {
  /** 지역을 골랐을 때 */
  onSelect: (city: City) => void;
  disabled?: boolean;
};

/** 날씨 볼 지역 고르기. 지역 이름을 직접 입력해서 찾고(예: 해운대, 판교, 도쿄), 결과 중 하나를 누른다. */
export function WeatherCityPicker({ onSelect, disabled }: Props) {
  const theme = useTheme();
  const search = useSearchPlaces();
  const [query, setQuery] = useState('');

  function runSearch() {
    if (query.trim()) search.mutate(query);
  }

  return (
    <View style={styles.wrapper}>
      <View style={styles.searchRow}>
        <View style={styles.searchField}>
          <TextField
            label="지역 직접 입력"
            placeholder="예: 해운대, 판교, 도쿄"
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={runSearch}
            returnKeyType="search"
            autoCorrect={false}
            maxLength={50}
          />
        </View>
        <Button
          label="검색"
          size="small"
          onPress={runSearch}
          disabled={!query.trim() || search.isPending}
        />
      </View>

      {search.isPending ? <ActivityIndicator color={theme.textSecondary} /> : null}

      {search.error ? (
        <ThemedText type="small" themeColor="danger">
          검색하지 못했습니다. 잠시 후 다시 시도해 주세요.
        </ThemedText>
      ) : null}

      {search.data && search.data.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          찾는 지역이 없습니다. 시·구·동 이름으로 다시 입력해 보세요.
        </ThemedText>
      ) : null}

      {search.data?.map((place) => (
        <Pressable
          key={place.id}
          accessibilityRole="button"
          accessibilityLabel={`${place.name} ${place.detail ?? ''} 날씨 보기`}
          disabled={disabled}
          onPress={() => onSelect(place)}
          style={({ pressed }) => [
            styles.result,
            { borderColor: theme.border },
            pressed && styles.pressed,
          ]}>
          <ThemedText type="default" style={styles.resultName}>
            {place.name}
          </ThemedText>
          {place.detail ? (
            <ThemedText type="small" themeColor="textSecondary">
              {place.detail}
            </ThemedText>
          ) : null}
        </Pressable>
      ))}

    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: Spacing.two,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
  },
  searchField: {
    flex: 1,
  },
  result: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.half,
  },
  resultName: {
    fontWeight: 700,
  },
  pressed: {
    opacity: 0.6,
  },
});
