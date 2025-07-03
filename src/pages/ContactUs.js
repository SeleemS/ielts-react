import React from 'react';
import {
  Box,
  Text,
  Link,
  VStack,
  Button,
  FormControl,
  FormLabel,
  Input,
  Textarea,
  useToast,
} from '@chakra-ui/react';
import { useRouter } from 'next/router';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const ContactUs = () => {
  const router = useRouter();
  const toast = useToast();

  const handleSubmit = (e) => {
    e.preventDefault();
    toast({
      title: 'Message sent!',
      description: 'We will get back to you as soon as possible.',
      status: 'success',
      duration: 5000,
      isClosable: true,
    });
    e.target.reset();
  };

  return (
    <Box minH="100vh" display="flex" flexDirection="column" bg="gray.50">
      <Navbar />
      <Box flex="1" maxW="lg" mx="auto" px={4} py={12} w="full">
        <VStack spacing={6} align="stretch">
          <Text fontSize="3xl" fontWeight="bold" color="gray.800" textAlign="center">
            Contact Us
          </Text>

          <Text fontSize="md" color="gray.600" textAlign="center">
            You can also email us directly at{' '}
            <Link href="mailto:info@ielts-bank.com" color="blue.500">
              info@ielts-bank.com
            </Link>
          </Text>

          <form onSubmit={handleSubmit}>
            <VStack spacing={4} align="stretch">
              <FormControl isRequired>
                <FormLabel>Your Name</FormLabel>
                <Input placeholder="John Doe" />
              </FormControl>

              <FormControl isRequired>
                <FormLabel>Email Address</FormLabel>
                <Input type="email" placeholder="john@example.com" />
              </FormControl>

              <FormControl isRequired>
                <FormLabel>Message</FormLabel>
                <Textarea rows={5} placeholder="How can we help you?" />
              </FormControl>

              <Button type="submit" colorScheme="blue" size="md">
                Send Message
              </Button>
            </VStack>
          </form>

          <Button
            variant="ghost"
            onClick={() => router.push('/')}
            alignSelf="center"
            mt={4}
            color="gray.600"
          >
            ← Back to Homepage
          </Button>
        </VStack>
      </Box>
      <Footer />
    </Box>
  );
};

export default ContactUs;
