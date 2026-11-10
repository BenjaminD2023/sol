import { Image } from "react-native";
const Favicon = ({ fallback, style, className }: { url: string; fallback: any; style?: any; className?: string }) => (
  <Image source={fallback} style={style} className={`w-5 h-5 rounded ${className ?? ""}`} resizeMode="contain" />
);
export default Favicon;
