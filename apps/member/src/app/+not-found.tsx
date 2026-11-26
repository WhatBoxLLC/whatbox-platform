import { Redirect } from 'expo-router';

// Unknown paths (including the preview being served under a sub-path) go to the start page.
export default function NotFound() {
  return <Redirect href="/" />;
}
