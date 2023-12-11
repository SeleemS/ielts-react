import React from 'react';
import { Box, Container, Text, Flex, Link, Spacer } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router-dom';
import PrivacyPolicy from '../pages/PrivacyPolicy';
import TermsOfService from '../pages/TermsOfService';

const Footer = () => {
    return (
        <Box bg="black" color="white" py={4}>
            <Container maxW="container.xl">
                <Flex direction={{ base: "column", md: "row" }} alignItems="center">
                    <Text fontSize="sm">© {new Date().getFullYear()} IELTSBank | All rights reserved.</Text>
                    <Spacer />
                    <Flex mt={{ base: 4, md: 0 }}>
                        <Link href="/termsofservice" mx={2} fontSize="sm">
                            Terms of Service
                        </Link>
                        {/* Updated Privacy Policy Link */}
                        <RouterLink to="/privacypolicy" style={{ textDecoration: 'none', color: 'white' }}>
                            <Text mx={2} fontSize="sm">Privacy Policy</Text>
                        </RouterLink>
                        <Link href="#" mx={2} fontSize="sm">
                            Contact Us
                        </Link>
                    </Flex>
                </Flex>
            </Container>
        </Box>
    );
};

export default Footer;

