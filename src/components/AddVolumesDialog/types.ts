import type { AddItem } from "../../lib/add";
import type { Catalog, Collection } from "../../lib/collection";

export interface AddVolumesDialogProps {
  open: boolean;
  catalog: Catalog;
  collection: Collection;
  initialNumbers?: readonly number[];
  onClose: () => void;
  onAdd: (items: readonly AddItem[]) => Promise<void>;
  onRememberIsbn: (isbn: string, number: number) => Promise<void>;
}
