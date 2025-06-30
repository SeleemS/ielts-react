import { ChakraProvider } from '@chakra-ui/react';
import ReactGA from 'react-ga';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import '../src/index.css';

ReactGA.initialize('G-1KRYZZY68X');

function MyApp({ Component, pageProps }) {
  const router = useRouter();
  useEffect(() => {
    const handleRouteChange = (url) => {
      ReactGA.pageview(url);
    };
    router.events.on('routeChangeComplete', handleRouteChange);
    return () => {
      router.events.off('routeChangeComplete', handleRouteChange);
    };
  }, [router.events]);

  return (
    <ChakraProvider>
      <Component {...pageProps} />
    </ChakraProvider>
  );
}

export default MyApp;
