// Shared UI pieces, styled from the current site's theme so every site is the same app in a different coat.
import type { PhotoView, SiteTheme } from '@whatbox/core';
import { Link, type Href } from 'expo-router';
import { createContext, useContext, useState, type ReactNode } from 'react';
import {
  ActivityIndicator, Image, Platform, Pressable, StyleSheet, Text, TextInput, View,
  useWindowDimensions, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useSession } from '../lib/session';

const ThemeOverride = createContext<SiteTheme | null>(null);
export const ThemeOverrideProvider = ThemeOverride.Provider;

export function useTheme(): SiteTheme {
  const override = useContext(ThemeOverride);
  const session = useSession();
  return override ?? session.site.theme;
}

export function useWide(min = 900) {
  return useWindowDimensions().width >= min;
}

const web = Platform.OS === 'web';
const FILL = { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 };
export const fonts = (t: SiteTheme) => ({
  heading: web ? `'${t.headingFont}', system-ui, sans-serif` : undefined,
  body: web ? `'${t.bodyFont}', system-ui, sans-serif` : undefined,
});

type TxtProps = { children: ReactNode; style?: StyleProp<TextStyle>; sub?: boolean; bold?: boolean; size?: number; color?: string; numberOfLines?: number; center?: boolean };
export function Txt({ children, style, sub, bold, size = 16, color, numberOfLines, center }: TxtProps) {
  const t = useTheme();
  return (
    <Text numberOfLines={numberOfLines} style={[{ fontFamily: fonts(t).body, color: color ?? (sub ? t.sub : t.ink), fontSize: size, lineHeight: Math.round(size * 1.5), fontWeight: bold ? '700' : '400', textAlign: center ? 'center' : undefined }, style]}>
      {children}
    </Text>
  );
}

export function H({ children, size = 30, style, level = 1 }: { children: ReactNode; size?: number; style?: StyleProp<TextStyle>; level?: 1 | 2 | 3 }) {
  const t = useTheme();
  return (
    <Text role="heading" aria-level={level} style={[{ fontFamily: fonts(t).heading, color: t.ink, fontSize: size, lineHeight: Math.round(size * 1.15), fontWeight: '700', letterSpacing: size > 24 ? -0.5 : 0 }, style]}>
      {children}
    </Text>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={{ fontFamily: fonts(t).body, color: '#8A5233', fontSize: 13, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase' }}>{children}</Text>;
}

type BtnProps = {
  label: string; onPress?: () => void; kind?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';
  icon?: IconName; disabled?: boolean; busy?: boolean; size?: 'md' | 'lg' | 'sm'; style?: StyleProp<ViewStyle>; accessibilityLabel?: string; flex?: boolean;
};
export function Btn({ label, onPress, kind = 'primary', icon, disabled, busy, size = 'md', style, accessibilityLabel, flex }: BtnProps) {
  const t = useTheme();
  const h = size === 'lg' ? 54 : size === 'sm' ? 40 : 48;
  const colors = {
    primary: { bg: t.accent, fg: '#FFFFFF', border: t.accent },
    secondary: { bg: t.surface, fg: t.ink, border: t.line },
    ghost: { bg: 'transparent', fg: t.accent, border: 'transparent' },
    danger: { bg: t.surface, fg: t.alert, border: t.line },
    soft: { bg: t.accentSoft, fg: t.accent, border: t.accentSoft },
  }[kind];
  return (
    <Pressable
      role="button"
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed, hovered }: any) => [
        {
          minHeight: h, paddingHorizontal: size === 'sm' ? 14 : 20, borderRadius: Math.min(t.radius, h / 2), backgroundColor: colors.bg,
          borderWidth: 1.5, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
        hovered && kind === 'primary' ? { filter: 'brightness(0.92)' } as any : null,
        flex ? { flex: 1 } : null,
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={colors.fg} /> : icon ? <Icon name={icon} size={20} color={colors.fg} /> : null}
      <Text style={{ fontFamily: fonts(t).body, color: colors.fg, fontWeight: '700', fontSize: size === 'lg' ? 17 : size === 'sm' ? 14 : 16 }}>{label}</Text>
    </Pressable>
  );
}

export function LinkText({ href, children, size = 15 }: { href: Href; children: ReactNode; size?: number }) {
  const t = useTheme();
  return (
    <Link href={href} style={{ fontFamily: fonts(t).body, color: t.accent, fontWeight: '600', fontSize: size }}>
      {children}
    </Link>
  );
}

export function Field({ label, hint, error, style, ...rest }: TextInputProps & { label: string; hint?: string; error?: string | null; style?: StyleProp<TextStyle> }) {
  const t = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Txt bold size={14}>{label}</Txt>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#8C948F"
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={[{
          fontFamily: fonts(t).body, fontSize: 16, color: t.ink, backgroundColor: t.surface, minHeight: 48,
          paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, borderColor: error ? t.alert : focus ? t.accent : '#CFC7BB',
        }, web ? ({ outlineStyle: 'none' } as any) : null, style]}
        {...rest}
      />
      {error ? <Txt size={14} color={t.alert}>{error}</Txt> : hint ? <Txt size={13} sub>{hint}</Txt> : null}
    </View>
  );
}

export function Card({ children, style, pad = 22 }: { children: ReactNode; style?: StyleProp<ViewStyle>; pad?: number }) {
  const t = useTheme();
  return <View style={[{ backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, borderRadius: 18, padding: pad }, style]}>{children}</View>;
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  const t = useTheme();
  const content = (
    <Text style={{ fontFamily: fonts(t).body, fontSize: 14, fontWeight: '600', color: selected ? '#FFFFFF' : t.ink }}>{label}</Text>
  );
  const style = { backgroundColor: selected ? t.accent : '#F1EDE6', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, minHeight: 36, justifyContent: 'center' as const };
  if (!onPress) return <View style={style}>{content}</View>;
  return (
    <Pressable role="checkbox" aria-checked={!!selected} accessibilityLabel={label} onPress={onPress} style={style}>{content}</Pressable>
  );
}

export function ChipPicker({ label, options, value, onChange, multi }: { label?: string; options: string[]; value: string[] | string | undefined; onChange: (v: any) => void; multi?: boolean }) {
  const selected = Array.isArray(value) ? value : value ? [value] : [];
  return (
    <View style={{ gap: 8 }}>
      {label ? <Txt bold size={14}>{label}</Txt> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((o) => (
          <Chip key={o} label={o} selected={selected.includes(o)} onPress={() => {
            if (multi) onChange(selected.includes(o) ? selected.filter((x) => x !== o) : [...selected, o]);
            else onChange(o);
          }} />
        ))}
      </View>
    </View>
  );
}

export function Check({ label, value, onChange, children }: { label: string; value: boolean; onChange: (v: boolean) => void; children?: ReactNode }) {
  const t = useTheme();
  return (
    <Pressable role="checkbox" aria-checked={value} accessibilityLabel={label} onPress={() => onChange(!value)} style={{ flexDirection: 'row', gap: 10, alignItems: 'center', minHeight: 36 }}>
      <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: value ? t.accent : '#CFC7BB', backgroundColor: value ? t.accent : t.surface, alignItems: 'center', justifyContent: 'center' }}>
        {value ? <Icon name="check" size={14} color="#FFFFFF" stroke={3} /> : null}
      </View>
      <View style={{ flex: 1 }}>{children ?? <Txt size={15}>{label}</Txt>}</View>
    </Pressable>
  );
}

export function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  const t = useTheme();
  return (
    <Pressable role="switch" aria-checked={value} accessibilityLabel={label} onPress={() => onChange(!value)} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 48 }}>
      <View style={{ flex: 1 }}>
        <Txt bold size={15}>{label}</Txt>
        {hint ? <Txt sub size={13}>{hint}</Txt> : null}
      </View>
      <View style={{ width: 48, height: 28, borderRadius: 14, backgroundColor: value ? t.accent : '#CFC7BB', padding: 3, alignItems: value ? 'flex-end' : 'flex-start' }}>
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFFFFF' }} />
      </View>
    </Pressable>
  );
}

export function Notice({ tone = 'info', title, children, icon = 'shield' }: { tone?: 'info' | 'warn' | 'error' | 'success'; title?: string; children: ReactNode; icon?: IconName }) {
  const t = useTheme();
  const c = {
    info: { bg: '#ECF3F1', border: '#ECF3F1', fg: t.ink, icon: t.accent },
    warn: { bg: '#FFF4E5', border: '#F0D3A6', fg: '#4A3410', icon: '#8A5A12' },
    error: { bg: '#FBEAE5', border: '#EFC5B8', fg: '#5A2416', icon: t.alert },
    success: { bg: '#E7F3EC', border: '#C7E3D2', fg: '#1F4A33', icon: '#2F7A52' },
  }[tone];
  return (
    <View role={tone === 'error' ? 'alert' : undefined} style={{ backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, borderRadius: 14, padding: 14, flexDirection: 'row', gap: 12 }}>
      <Icon name={icon} size={22} color={c.icon} />
      <View style={{ flex: 1, gap: 2 }}>
        {title ? <Txt bold size={14} color={c.fg}>{title}</Txt> : null}
        {typeof children === 'string' ? <Txt size={14} color={c.fg}>{children}</Txt> : children}
      </View>
    </View>
  );
}

export function Badge({ label, tone = 'accent' }: { label: string; tone?: 'accent' | 'alert' | 'online' | 'dark' }) {
  const t = useTheme();
  const c = { accent: [t.accentSoft, t.accent], alert: [t.alert, '#FFFFFF'], online: ['#FFFFFF', '#23663F'], dark: ['rgba(30,38,41,0.72)', '#FFFFFF'] }[tone];
  return (
    <View style={{ backgroundColor: c[0], borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}>
      {tone === 'online' ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#2F7A52' }} /> : null}
      <Text style={{ fontFamily: fonts(t).body, color: c[1], fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

export function Loading() {
  const t = useTheme();
  return <View style={{ padding: 48, alignItems: 'center' }}><ActivityIndicator color={t.accent} size="large" /></View>;
}

export function Page({ children, max = 1200, style }: { children: ReactNode; max?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ width: '100%', maxWidth: max, alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 24 }, style]}>{children}</View>;
}

// ---------- Photos ----------

export function Silhouette({ bg, fg, size = '70%' }: { bg: string; fg: string; size?: number | `${number}%` }) {
  return (
    <View style={{ ...FILL, backgroundColor: bg, alignItems: 'center', justifyContent: 'flex-end' }}>
      <Svg width={size} height={size} viewBox="0 0 40 46" aria-hidden>
        <Circle cx="20" cy="15" r="9" fill={fg} />
        <Path d="M3 46c2-11 9-16 17-16s15 5 17 16Z" fill={fg} />
      </Svg>
    </View>
  );
}

export function PhotoTile({ photo, style, radius = 12, children, silhouette = '78%' }: { photo?: PhotoView; style?: StyleProp<ViewStyle>; radius?: number; children?: ReactNode; silhouette?: number | `${number}%` }) {
  const t = useTheme();
  let inner: ReactNode;
  if (!photo) inner = <Silhouette bg="#EFEAE2" fg="#DCD5CA" size={silhouette} />;
  else if (photo.placeholder === 'locked') {
    inner = <View style={{ ...FILL, backgroundColor: '#DCD5CA', alignItems: 'center', justifyContent: 'center' }}><Icon name="lock" size={22} color="#6B6459" /></View>;
  } else if (photo.placeholder) {
    inner = (
      <View style={{ ...FILL, backgroundColor: '#E5E0D8', alignItems: 'center', justifyContent: 'center', padding: 6, gap: 4 }}>
        <Icon name={photo.placeholder === 'app_safe' ? 'globe' : 'eyeOff'} size={20} color="#6B6459" />
        <Text style={{ fontFamily: fonts(t).body, fontSize: 11, color: '#4F4A42', textAlign: 'center' }}>{photo.placeholder === 'app_safe' ? 'View on the website' : 'Hidden by your filter'}</Text>
      </View>
    );
  } else if (photo.url) inner = <Image source={{ uri: photo.url }} style={FILL} resizeMode="cover" accessibilityIgnoresInvertColors />;
  else if (photo.tone) inner = <Silhouette bg={photo.tone[0]} fg={photo.tone[1]} size={silhouette} />;
  else inner = <Silhouette bg="#EFEAE2" fg="#DCD5CA" size={silhouette} />;
  return (
    <View style={[{ borderRadius: radius, overflow: 'hidden', backgroundColor: '#EFEAE2', position: 'relative' }, style]}>
      {inner}
      {children}
    </View>
  );
}

export function Avatar({ photo, size = 44 }: { photo?: PhotoView; size?: number }) {
  return <PhotoTile photo={photo} radius={size / 2} style={{ width: size, height: size }} silhouette="86%" />;
}

// ---------- Icons (inline stroke SVG, same set as the mockup) ----------

const ICONS = {
  heart: ['M19.5 12.6 12 20l-7.5-7.4A4.8 4.8 0 0 1 12 6.3a4.8 4.8 0 0 1 7.5 6.3Z'],
  chat: ['M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z'],
  lock: ['rect:4,11,16,10,2', 'M8 11V7a4 4 0 0 1 8 0v4'],
  shield: ['M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z'],
  check: ['M20 6 9 17l-5-5'],
  back: ['m15 18-6-6 6-6'],
  next: ['m9 18 6-6-6-6'],
  flag: ['M4 21V4', 'M4 4h12l-2 4 2 4H4'],
  search: ['circle:11,11,7', 'm20 20-3.5-3.5'],
  user: ['circle:12,8,4', 'M4 21c1-4 4-6 8-6s7 2 8 6'],
  dots: ['circle:12,5,1.5', 'circle:12,12,1.5', 'circle:12,19,1.5'],
  send: ['M5 12h14', 'm13 6 6 6-6 6'],
  eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z', 'circle:12,12,3'],
  eyeOff: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z', 'm3 3 18 18'],
  image: ['rect:3,3,18,18,3', 'circle:9,9,2', 'm21 15-5-5L5 21'],
  card: ['rect:2,5,20,14,2', 'M2 10h20'],
  plus: ['M12 5v14', 'M5 12h14'],
  x: ['M18 6 6 18', 'm6 6 12 12'],
  star: ['m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z'],
  globe: ['circle:12,12,9', 'M3 12h18', 'M12 3a14 14 0 0 1 0 18', 'M12 3a14 14 0 0 0 0 18'],
  settings: ['circle:12,12,3', 'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z'],
  grid: ['rect:3,3,7,7,1', 'rect:14,3,7,7,1', 'rect:3,14,7,7,1', 'rect:14,14,7,7,1'],
  file: ['M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z', 'M14 3v6h6'],
  users: ['circle:9,8,4', 'M2 21c1-4 3.5-6 7-6s6 2 7 6', 'M16 4a4 4 0 0 1 0 8', 'M18 15c2 .6 3.4 2.6 4 6'],
  sliders: ['M4 6h10', 'M18 6h2', 'circle:16,6,2', 'M4 12h4', 'M12 12h8', 'circle:10,12,2', 'M4 18h12', 'M20 18h0', 'circle:18,18,2'],
  logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'm16 17 5-5-5-5', 'M21 12H9'],
  refresh: ['M21 12a9 9 0 1 1-3-6.7L21 8', 'M21 3v5h-5'],
  calendar: ['rect:3,5,18,16,2', 'M3 10h18', 'M8 3v4', 'M16 3v4'],
  pin: ['M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z', 'circle:12,10,2.5'],
} as const;
export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 22, color = 'currentColor', stroke = 2 }: { name: IconName; size?: number; color?: string; stroke?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICONS[name].map((d, i) => {
        if (d.startsWith('rect:')) {
          const [x, y, w, h, r] = d.slice(5).split(',').map(Number);
          return <Rect key={i} x={x} y={y} width={w} height={h} rx={r} />;
        }
        if (d.startsWith('circle:')) {
          const [cx, cy, r] = d.slice(7).split(',').map(Number);
          return <Circle key={i} cx={cx} cy={cy} r={r} />;
        }
        return <Path key={i} d={d} />;
      })}
    </Svg>
  );
}

export function Logo({ size = 30, name }: { size?: number; name?: string }) {
  const t = useTheme();
  const site = useSession().site;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Svg width={size} height={size} viewBox="0 0 34 34" aria-hidden>
        <Circle cx="13" cy="17" r="10" fill="none" stroke={t.accent} strokeWidth={3} />
        <Circle cx="21" cy="17" r="10" fill="none" stroke={t.second} strokeWidth={3} />
      </Svg>
      <Text style={{ fontFamily: fonts(t).heading, fontWeight: '700', fontSize: size * 0.75, color: t.ink }}>{name ?? site.name}</Text>
    </View>
  );
}

export function ErrorText({ error }: { error: string | null | undefined }) {
  const t = useTheme();
  if (!error) return null;
  return <Txt size={14} color={t.alert} style={{ marginTop: 4 }}>{error}</Txt>;
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const t = useTheme();
  return (
    <View role="tablist" style={{ flexDirection: 'row', backgroundColor: '#EAE4DB', padding: 5, borderRadius: 999, gap: 6 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} role="tab" aria-selected={on} onPress={() => onChange(o.value)}
            style={{ flexGrow: 1, flexShrink: 0, flexBasis: 'auto', minHeight: 42, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, backgroundColor: on ? '#FFFFFF' : 'transparent', ...(on ? { shadowColor: '#1E2629', shadowOpacity: 0.15, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } } : {}) }}>
            <Text numberOfLines={1} style={{ fontFamily: fonts(t).body, fontWeight: on ? '700' : '600', fontSize: 15, color: on ? t.ink : t.sub }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function relTime(iso: string): string {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

export function clockTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// Responsive grid: measures its own width and fits as many columns of at least `min` px as it can.
export function Grid({ children, min = 220, gap = 18, max = 4 }: { children: ReactNode[]; min?: number; gap?: number; max?: number }) {
  const [w, setW] = useState(0);
  const cols = w ? Math.max(1, Math.min(max, Math.floor((w + gap) / (min + gap)))) : 1;
  const itemW = w ? (w - gap * (cols - 1)) / cols : undefined;
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
      {w ? children.map((c, i) => <View key={i} style={{ width: itemW }}>{c}</View>) : null}
    </View>
  );
}
