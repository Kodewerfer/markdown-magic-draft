// NOTE: this is what the very first state of a component(that can be consider as "activatable") should return, these are keydown handlers that will run conditionally.
// Editor's handler serve as "default behavior" whereas components may have their own behaviors.
// the returning value of these components' handler determined whether the "default behavior" should continue to run.
export type TActivationReturn = {
    'enter'?: (ev: Event) => void | boolean | Promise<boolean>
    'del'?: (ev: Event) => void | boolean,
    'backspace'?: (ev: Event) => void | boolean,
};