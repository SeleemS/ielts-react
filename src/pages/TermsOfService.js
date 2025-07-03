import React from 'react';
import {
  Box,
  Flex,
  VStack,
  Text,
  Button,
  useBreakpointValue,
} from '@chakra-ui/react';
import { useRouter } from 'next/router';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const TermsOfService = () => {
  const router = useRouter();

  return (
    <Flex direction="column" minHeight="100vh">
      <Navbar />

      <Box flex="1" px={{ base: 4, md: 12 }} py={8}>
        <VStack spacing={6} align="start" maxW="4xl" mx="auto">
          <Button
            colorScheme="blue"
            variant="solid"
            onClick={() => router.push('/')}
          >
            ← Back to Homepage
          </Button>

          <Text fontSize="3xl" fontWeight="bold">
            Terms of Service
          </Text>

          <Box fontSize="md" color="gray.700" lineHeight="1.8" width="100%">
            <Text mb={4}>
              Welcome to IELTSBank. Below are our Terms of Service, which outline
              the rules and regulations for the use of IELTSBank's Website.
            </Text>

            <Text mb={4}>
              <strong>1. Terms</strong><br />
              By accessing this website, you agree to be bound by these Terms of Service and comply with any applicable local laws.
            </Text>

            <Text mb={4}>
              <strong>2. Use License</strong><br />
              Permission is granted to temporarily download one copy of the materials on IELTSBank's website for personal, non-commercial use only.
            </Text>

            <Text mb={4}>
              <strong>3. Disclaimer</strong><br />
              The materials on IELTSBank’s website are provided "as is." IELTSBank disclaims all warranties, expressed or implied.
            </Text>

            <Text mb={4}>
              <strong>4. Limitations</strong><br />
              IELTSBank or its suppliers shall not be liable for any damages arising from the use or inability to use the website.
            </Text>

            <Text mb={4}>
              <strong>5. Revisions and Errata</strong><br />
              The materials on IELTSBank’s website may include errors. IELTSBank does not guarantee their accuracy or currency.
            </Text>

            <Text mb={4}>
              <strong>6. Site Terms of Use Modifications</strong><br />
              IELTSBank may revise these terms at any time without notice. By using this site, you agree to be bound by the current version.
            </Text>

            <Text mb={4}>
              <strong>Last Updated:</strong> December 11, 2024
            </Text>

            <Text>
              If you have any questions about these Terms of Service, please contact us.
            </Text>
          </Box>
        </VStack>
      </Box>

      <Footer />
    </Flex>
  );
};

export default TermsOfService;
