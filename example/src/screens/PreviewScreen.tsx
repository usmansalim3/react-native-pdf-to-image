import { useRef, useState } from 'react';
import {
  Text,
  View,
  Image,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { PageImage } from '@uzimandias/react-native-pdf-to-image';
import { theme, imageSource } from '../ui';
import type { RootStackParamList } from '../App';

const THUMB = 56;

type Props = NativeStackScreenProps<RootStackParamList, 'Preview'>;

export default function PreviewScreen({ route, navigation }: Props) {
  const { pages, initialIndex = 0 } = route.params;
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(initialIndex);
  const pagerRef = useRef<FlatList<PageImage>>(null);
  const thumbsRef = useRef<FlatList<PageImage>>(null);

  const syncThumbs = (i: number) =>
    thumbsRef.current?.scrollToIndex({
      index: i,
      animated: true,
      viewPosition: 0.5,
    });

  const goTo = (i: number) => {
    setIndex(i);
    pagerRef.current?.scrollToIndex({ index: i, animated: true });
    syncThumbs(i);
  };

  const onPagerScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index) {
      setIndex(i);
      syncThumbs(i);
    }
  };

  const current = pages[index];
  const imageHeight = height - (insets.top + insets.bottom + 180);

  return (
    <View style={styles.screen}>
      {/* Full-screen swipeable pager. Each page sits in a zoomable ScrollView
          (pinch-to-zoom via maximumZoomScale). */}
      <FlatList
        ref={pagerRef}
        data={pages}
        keyExtractor={(p) => String(p.page)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={initialIndex}
        getItemLayout={(_, i) => ({
          length: width,
          offset: width * i,
          index: i,
        })}
        onMomentumScrollEnd={onPagerScrollEnd}
        renderItem={({ item }) => (
          <ScrollView
            style={{ width }}
            contentContainerStyle={styles.zoomContent}
            maximumZoomScale={4}
            minimumZoomScale={1}
            centerContent
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
          >
            <Image
              source={imageSource(item)}
              style={{ width, height: imageHeight }}
              resizeMode="contain"
            />
          </ScrollView>
        )}
      />

      {/* Top bar */}
      <View
        style={[styles.topBar, { paddingTop: insets.top + 8 }]}
        pointerEvents="box-none"
      >
        <Pressable onPress={() => navigation.goBack()} style={styles.pill}>
          <Text style={styles.pillText}>‹ Back</Text>
        </Pressable>
        <View style={styles.pill}>
          <Text style={styles.pillText}>
            {index + 1} / {pages.length}
          </Text>
        </View>
      </View>

      {/* Bottom: metadata + thumbnail strip */}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 12 }]}>
        {current && (
          <Text style={styles.meta}>
            page {current.page} · {current.width}×{current.height}px ·{' '}
            {current.format.toUpperCase()}
          </Text>
        )}
        <FlatList
          ref={thumbsRef}
          data={pages}
          keyExtractor={(p) => `t-${p.page}`}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.thumbs}
          getItemLayout={(_, i) => ({
            length: THUMB + 8,
            offset: (THUMB + 8) * i,
            index: i,
          })}
          renderItem={({ item, index: i }) => (
            <Pressable onPress={() => goTo(i)}>
              <Image
                source={imageSource(item)}
                style={[styles.thumb, i === index && styles.thumbActive]}
                resizeMode="cover"
              />
            </Pressable>
          )}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  zoomContent: { flexGrow: 1, justifyContent: 'center' },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pill: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  pillText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  bottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  meta: {
    color: theme.textDim,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 10,
  },
  thumbs: { paddingHorizontal: 16, gap: 8 },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: 6,
    backgroundColor: '#222',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbActive: { borderColor: theme.accent },
});
