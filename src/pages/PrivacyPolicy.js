import React from 'react';
import {
  Box,
  Flex,
  VStack,
  Text,
  Button,
} from '@chakra-ui/react';
import { useRouter } from 'next/router';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const PrivacyPolicy = () => {
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
            Privacy Policy
          </Text>

          <Box fontSize="md" color="gray.700" lineHeight="1.8" width="100%">
            <Text mb={4}>
              Welcome to IELTSBank. This privacy policy outlines our policies regarding the collection, use, and disclosure of information we receive from users of our site.
            </Text>

            <Text mb={4}>
              <strong>Information Collection and Use</strong><br />
              IELTSBank does not collect any personally identifiable information from its users. Users are free to visit the site anonymously and no personal data is required for access to most services.
            </Text>

            <Text mb={4}>
              <strong>Log Data</strong><br />
              We do not collect browser log data such as IP addresses, browser types, or visited pages.
            </Text>

            <Text mb={4}>
              <strong>Cookies and Tracking</strong><br />
              IELTSBank does not use cookies or tracking technologies. Your privacy is fully respected.
            </Text>

            <Text mb={4}>
              <strong>Data Security</strong><br />
              Since no personal data is collected, there is no risk of such data being exposed or misused.
            </Text>

            <Text mb={4}>
              <strong>Changes to This Privacy Policy</strong><br />
              This policy is effective as of the last updated date. We may update it in the future, with changes effective upon posting. Please check periodically.
            </Text>

            <Text mb={4}>
              <strong>Last Updated:</strong> December 11, 2024
            </Text>

            <Text>
              If you have any questions about this Privacy Policy, please contact us.
            </Text>
          </Box>
        </VStack>
      </Box>

      <Footer />
    </Flex>
  );
};

export default PrivacyPolicy;
