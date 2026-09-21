import { useEffect, useState } from 'react';
import { onNative, type Heading } from '../bridge/bridge';

/** Dernier cap reçu (null tant que le capteur n'a rien envoyé). */
export function useHeading(): Heading | null {
  const [heading, setHeading] = useState<Heading | null>(null);
  useEffect(() => onNative('heading', setHeading), []);
  return heading;
}
