import MusicPlayer from '@/components/MusicPlayer';

interface IndexProps {
  isAdminRoute?: boolean;
}

export default function Index({ isAdminRoute = false }: IndexProps) {
  return <MusicPlayer isAdminRoute={isAdminRoute} />;
}