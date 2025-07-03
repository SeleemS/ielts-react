import React from 'react';
import { Box, Container, Text, Flex, Link, Spacer } from '@chakra-ui/react';
import NextLink from 'next/link';

const Footer = () => {
    const scrollToTop = () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    };
    
    return (
        <Box bg="gray.900" color="white" py={8} mt="auto">
            <Container maxW="container.xl">
                <Flex direction={{ base: "column", md: "row" }} alignItems="center" gap={4}>
                    <Text fontSize="sm" color="gray.400" fontWeight="500">
                        © {new Date().getFullYear()} IELTS-Bank. All rights reserved.
                    </Text>
                    <Spacer />
                    <Flex gap={6} direction={{ base: "column", md: "row" }} align="center">
                        <NextLink href="/termsofservice" passHref legacyBehavior>
                            <Link 
                                onClick={scrollToTop} 
                                color="gray.300"
                                fontSize="sm"
                                fontWeight="500"
                                _hover={{ 
                                    color: 'white',
                                    textDecoration: 'none'
                                }}
                                transition="color 0.2s"
                            >
                                Terms of Service
                            </Link>
                        </NextLink>
                        <NextLink href="/privacypolicy" passHref legacyBehavior>
                            <Link 
                                onClick={scrollToTop} 
                                color="gray.300"
                                fontSize="sm"
                                fontWeight="500"
                                _hover={{ 
                                    color: 'white',
                                    textDecoration: 'none'
                                }}
                                transition="color 0.2s"
                            >
                                Privacy Policy
                            </Link>
                        </NextLink>
                        <NextLink href="/contactus" passHref legacyBehavior>
                            <Link 
                                onClick={scrollToTop} 
                                color="gray.300"
                                fontSize="sm"
                                fontWeight="500"
                                _hover={{ 
                                    color: 'white',
                                    textDecoration: 'none'
                                }}
                                transition="color 0.2s"
                            >
                                Contact Us
                            </Link>
                        </NextLink>
                    </Flex>
                </Flex>
            </Container>
        </Box>
    );
};

export default Footer;