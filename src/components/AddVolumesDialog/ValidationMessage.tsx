import { Trans } from "@lingui/react/macro";
import {
  MAX_ADD_ITEMS,
  MAX_VOLUME_NUMBER,
  type AddValidationError,
} from "../../lib/add";

export function ValidationMessage({ error }: { error: AddValidationError }) {
  switch (error) {
    case "empty":
      return <Trans>Bitte mindestens eine Nummer eingeben.</Trans>;
    case "too-many":
      return (
        <Trans>Es sind höchstens {MAX_ADD_ITEMS} Bände pro Vorgang möglich.</Trans>
      );
    case "invalid-number":
      return <Trans>Eine Nummer ist keine ganze Zahl.</Trans>;
    case "number-out-of-range":
      return (
        <Trans>Nummern müssen zwischen 1 und {MAX_VOLUME_NUMBER} liegen.</Trans>
      );
  }
}
