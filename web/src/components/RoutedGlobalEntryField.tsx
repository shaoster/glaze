import { useGlobalFieldRouting } from "../routing/pieceRouting";
import GlobalEntryField, { type GlobalEntryFieldProps } from "./GlobalEntryField";

interface RoutedGlobalEntryFieldProps extends Omit<GlobalEntryFieldProps, "routing"> {
  pieceId: string;
  // fieldName uniquely identifies this field in the URL. Defaults to globalName
  // but must be set explicitly when multiple fields on the same state reference
  // the same globalName (e.g. "current_location" and "kiln_location" both
  // reference globalName "location").
  fieldName?: string;
}

export default function RoutedGlobalEntryField({
  pieceId,
  fieldName,
  globalName,
  ...props
}: RoutedGlobalEntryFieldProps) {
  const routing = useGlobalFieldRouting(pieceId, fieldName ?? globalName);
  return <GlobalEntryField {...props} globalName={globalName} routing={routing} />;
}
