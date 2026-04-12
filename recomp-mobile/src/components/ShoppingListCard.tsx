import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  Linking,
  Alert,
} from "react-native";
import { Card, Button } from "./ui";
import { colors, fontSize, fontWeight, radius, spacing } from "../theme";
import { buildShoppingListFromPlan } from "../lib/shopping-list";
import { getShoppingList, saveShoppingList } from "../lib/storage";
import { apiJson } from "../lib/api";
import { API_BASE_URL, ACT_SERVICE_URL } from "../lib/config";
import type { FitnessPlan } from "../lib/types";

interface GroceryResult {
  searchTerm: string;
  found?: boolean;
  product?: { name?: string; price?: string; available?: boolean };
  addedToCart?: boolean;
  addToCartUrl?: string;
  productUrl?: string;
  source?: string;
  error?: string;
}

interface GroceryResponse {
  results?: GroceryResult[];
  note?: string;
  error?: string;
}

const BATCH_SIZE = 5;

/**
 * Opens URL - on mobile, amazon.com links open in the Amazon app when installed
 * (Universal Links on iOS, App Links on Android). Falls back to browser otherwise.
 */
async function openAmazonLink(url: string) {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert("Cannot open link", "Please check that the Amazon app or a browser is available.");
  }
}

export function ShoppingListCard({ plan }: { plan: FitnessPlan | null }) {
  const [items, setItems] = useState<string[]>([]);
  const [newItem, setNewItem] = useState("");
  const [sending, setSending] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [results, setResults] = useState<GroceryResult[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getShoppingList().then(setItems);
  }, []);

  const persist = useCallback((next: string[]) => {
    setItems(next);
    saveShoppingList(next);
  }, []);

  const handleLoadFromPlan = () => {
    if (!plan) return;
    const fromPlan = buildShoppingListFromPlan(plan);
    if (fromPlan.length === 0) return;
    persist(fromPlan);
  };

  const handleAddItem = () => {
    const trimmed = newItem.trim();
    if (!trimmed || items.includes(trimmed)) return;
    setNewItem("");
    persist([...items, trimmed]);
  };

  const handleRemove = (index: number) => {
    persist(items.filter((_, i) => i !== index));
  };

  const handleSendToAmazon = async () => {
    if (items.length === 0) {
      setError("Add items or load from your meal plan first.");
      return;
    }

    const batches: string[][] = [];
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      batches.push(items.slice(i, i + BATCH_SIZE));
    }

    setSending(true);
    setError(null);
    setNote(null);
    setResults([]);
    const allResults: GroceryResult[] = [];

    try {
      for (let i = 0; i < batches.length; i++) {
        setBatchProgress({ current: i + 1, total: batches.length });
        const payload = { items: batches[i], store: "amazon" };

        let data: GroceryResponse;
        try {
          if (ACT_SERVICE_URL) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 480_000);
            const res = await fetch(`${ACT_SERVICE_URL}/grocery`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
              signal: controller.signal,
            });
            clearTimeout(timer);
            if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
            data = await res.json();
          } else {
            data = await apiJson<GroceryResponse>("/api/act/grocery", {
              method: "POST",
              body: JSON.stringify(payload),
            });
          }
        } catch {
          setNote("Request timed out. Tap a link below to search Amazon.");
          const fallback = batches[i].map((item) => ({
            searchTerm: item,
            found: true,
            addedToCart: false,
            product: { name: item, price: "—", available: true },
            addToCartUrl: `https://www.amazon.com/s?k=${encodeURIComponent(item)}`,
            source: "fallback",
          }));
          allResults.push(...fallback);
          setResults([...allResults]);
          continue;
        }

        if (data.error && !data.results?.length) {
          setError(data.error);
          break;
        }

        if (data.note) setNote(data.note);
        const batchResults = data.results ?? [];
        allResults.push(...batchResults);
        setResults([...allResults]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to search Amazon");
    } finally {
      setSending(false);
      setBatchProgress(null);
    }
  };

  const addedCount = results.filter((r) => r.addedToCart).length;
  const foundCount = results.filter((r) => r.found).length;

  return (
    <Card flat>
      <Text style={styles.sectionTitle}>Shopping list</Text>
      <Text style={styles.sectionSub}>
        Build a list from your diet plan. Tap a link to open in the Amazon app and add to cart.
      </Text>

      {plan && (
        <TouchableOpacity
          onPress={handleLoadFromPlan}
          disabled={sending}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.loadFromPlan}
        >
          <Text style={styles.linkText}>Load from my meal plan</Text>
        </TouchableOpacity>
      )}

      <ScrollView
        style={styles.listScroll}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
      >
        {items.length === 0 ? (
          <Text style={styles.emptyText}>No items yet. Add below or load from your meal plan.</Text>
        ) : (
          items.map((item, i) => (
            <View key={`${i}-${item}`} style={styles.listRow}>
              <Text style={styles.listItem} numberOfLines={1}>{item}</Text>
              <TouchableOpacity
                onPress={() => handleRemove(i)}
                disabled={sending}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={styles.removeBtn}
              >
                <Text style={styles.removeText}>×</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>

      <View style={styles.addRow}>
        <TextInput
          style={styles.input}
          placeholder="Add an item..."
          placeholderTextColor={colors.muted}
          value={newItem}
          onChangeText={setNewItem}
          onSubmitEditing={handleAddItem}
          editable={!sending}
          returnKeyType="done"
        />
        <Button
          title="Add"
          onPress={handleAddItem}
          disabled={sending || !newItem.trim()}
          variant="secondary"
          style={styles.addBtn}
        />
      </View>

      <Button
        title={
          sending && batchProgress
            ? `Searching Amazon… (${batchProgress.current}/${batchProgress.total})`
            : "Search Amazon"
        }
        onPress={handleSendToAmazon}
        disabled={sending || items.length === 0}
        loading={sending}
        style={styles.searchBtn}
      />

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {note && !error ? <Text style={styles.noteText}>{note}</Text> : null}

      {results.length > 0 && (
        <View style={styles.results}>
          <Text style={styles.resultsHeader}>
            {addedCount > 0
              ? `Added ${addedCount} of ${results.length} to cart`
              : `Found ${foundCount} of ${results.length} items`}
          </Text>
          {results.map((r, i) => {
            const url = r.productUrl ?? r.addToCartUrl;
            const label = r.productUrl
              ? "View"
              : r.addToCartUrl
                ? "Search on Amazon"
                : null;
            return (
              <View key={`${i}-${r.searchTerm}`} style={styles.resultRow}>
                <Text style={styles.resultTerm} numberOfLines={1}>{r.searchTerm}</Text>
                <View style={styles.resultMeta}>
                  <Text style={styles.resultMetaText}>
                    {r.found ? (r.product?.price ?? "Found") : "Not found"}
                    {r.addedToCart ? " · In cart" : ""}
                  </Text>
                  {url && label && (
                    <TouchableOpacity
                      onPress={() => openAmazonLink(url)}
                      activeOpacity={0.7}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      style={styles.linkButton}
                      accessibilityRole="link"
                      accessibilityLabel={`${label} for ${r.searchTerm}`}
                      accessibilityHint="Opens in Amazon app"
                    >
                      <Text style={styles.linkButtonText}>{label}</Text>
                    </TouchableOpacity>
                  )}
                  {r.error ? <Text style={styles.errorText}> · {r.error}</Text> : null}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: fontSize.h5,
    fontWeight: fontWeight.semibold,
    color: colors.foreground,
  },
  sectionSub: {
    fontSize: fontSize.small,
    color: colors.muted,
    marginTop: spacing[2],
  },
  loadFromPlan: {
    marginTop: spacing[3],
    marginBottom: spacing[2],
  },
  linkText: {
    fontSize: fontSize.small,
    color: colors.accent,
  },
  listScroll: {
    maxHeight: 160,
    marginBottom: spacing[3],
  },
  emptyText: {
    fontSize: fontSize.small,
    color: colors.muted,
    marginBottom: spacing[2],
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    marginBottom: spacing[2],
  },
  listItem: {
    fontSize: fontSize.small,
    color: colors.foreground,
    flex: 1,
  },
  removeBtn: {
    padding: spacing[2],
  },
  removeText: {
    fontSize: fontSize.body,
    color: colors.accentTerracotta,
  },
  addRow: {
    flexDirection: "row",
    gap: spacing[2],
    marginBottom: spacing[3],
  },
  input: {
    flex: 1,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    fontSize: fontSize.small,
    color: colors.foreground,
  },
  addBtn: {
    minWidth: 64,
  },
  searchBtn: {
    marginBottom: spacing[2],
  },
  errorText: {
    fontSize: fontSize.small,
    color: colors.accentTerracotta,
    marginBottom: spacing[2],
  },
  noteText: {
    fontSize: fontSize.small,
    color: colors.muted,
    marginBottom: spacing[2],
  },
  results: {
    marginTop: spacing[3],
    paddingTop: spacing[3],
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  resultsHeader: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.medium,
    color: colors.muted,
    marginBottom: spacing[2],
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    marginBottom: spacing[2],
  },
  resultTerm: {
    fontSize: fontSize.small,
    color: colors.foreground,
    flex: 1,
  },
  resultMeta: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing[2],
  },
  resultMetaText: {
    fontSize: fontSize.caption,
    color: colors.muted,
  },
  linkButton: {
    paddingVertical: spacing[1],
  },
  linkButtonText: {
    fontSize: fontSize.caption,
    color: colors.accent,
    fontWeight: fontWeight.medium,
  },
});
