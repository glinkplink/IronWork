/** After anonymous capture + save, parent may redirect and show a banner. */
export type CaptureFlowFinishedPayload = {
  captureKind: 'pdf' | 'esign';
  ok: boolean;
};
