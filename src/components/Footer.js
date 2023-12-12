import React from 'react';
import { Box, Container, Text, Flex, Link, Spacer } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router-dom';
import PrivacyPolicy from '../pages/PrivacyPolicy';
import TermsOfService from '../pages/TermsOfService';
import ContactUs from '../pages/ContactUs';

const Footer = () => {

    const scrollToTop = () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth' // Optional: add smooth scrolling
        });
    };
    
    return (
        <Box bg="black" color="white" py={4}>
            <Container maxW="container.xl">
                <Flex direction={{ base: "column", md: "row" }} alignItems="center">
                    <Text fontSize="sm">© {new Date().getFullYear()} IELTS-Bank | All rights reserved.</Text>
                    <Spacer />
                    <Flex mt={{ base: 4, md: 0 }}>
                        {/* Updated Terms of Service Link */}
                        <RouterLink to="/termsofservice" onClick={scrollToTop} style={{ textDecoration: 'none', color: 'white', marginRight: '8px', fontSize: '0.875rem' }}>
                            Terms of Service
                        </RouterLink>
                        {/* Updated Privacy Policy Link */}
                        <RouterLink to="/privacypolicy" onClick={scrollToTop} style={{ textDecoration: 'none', color: 'white', marginRight: '8px', fontSize: '0.875rem' }}>
                            Privacy Policy
                        </RouterLink>
                        {/* Updated Contact Us Link */}
                        <RouterLink to="/contactus" onClick={scrollToTop} style={{ textDecoration: 'none', color: 'white', fontSize: '0.875rem' }}>
                            Contact Us
                        </RouterLink>
                    </Flex>
                </Flex>
            </Container>
        </Box>
    );
};

export default Footer;

