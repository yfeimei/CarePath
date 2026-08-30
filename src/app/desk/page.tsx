import { destinationOptions } from '@/lib/catalog';
import DeskClient from './DeskClient';

export const metadata = { title: 'CarePath — Reception Desk' };

export default function DeskPage() {
  return <DeskClient destinations={destinationOptions()} />;
}
