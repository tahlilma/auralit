'use client';
import {
  BadgePercent, Banknote, BookOpen, Boxes, Building2, CalendarCheck, ChartLine, FileBarChart, HandCoins, IdCard, Landmark, LayoutDashboard,
  MessageSquareText, NotebookPen, Package, PackagePlus, Receipt, Redo2, Settings2, ShieldCheck, ShoppingCart, Undo2, UserCog, Users, Wallet, Wrench,
  type LucideIcon,
} from 'lucide-react';

export const ICONS: Record<string, LucideIcon> = {
  BadgePercent, Banknote, BookOpen, Boxes, Building2, CalendarCheck, ChartLine, FileBarChart, HandCoins, IdCard, Landmark, LayoutDashboard,
  MessageSquareText, NotebookPen, Package, PackagePlus, Receipt, Redo2, Settings2, ShieldCheck, ShoppingCart, Undo2, UserCog, Users, Wallet, Wrench,
};

export function NavIcon({ name, className }: { name: string; className?: string }) {
  const I = ICONS[name] ?? LayoutDashboard;
  return <I className={className} />;
}
