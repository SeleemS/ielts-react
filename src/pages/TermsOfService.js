import React from 'react';
import { Box, Flex, VStack, Text, useBreakpointValue } from '@chakra-ui/react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const TermsOfService = () => {
    const adDisplay = useBreakpointValue({ base: 'none', md: 'block' });

    return (
        <Box>
            <Navbar />
            <Flex
                direction={{ base: "column", md: "row" }}
                justify="space-between"
                align="center"
                wrap="wrap"
                px={{ md: 8 }}
                py={6}
            >
                <Flex display={adDisplay} width="300px" height="600px" bg="gray.200" mx={2} justifyContent="center" alignItems="center">
                    <Flex justifyContent="center" alignItems="center" width="100%" height="100%">
                        <Text>Ad Container</Text>
                    </Flex>
                </Flex>

                <VStack spacing={4} flex="1" minWidth="300px" px={4}>
                    <Text fontSize="2xl" fontWeight="bold">Terms of Service</Text>
                    <Box overflowY="auto" maxH="70vh" width="100%">
                        <Text>
                            Welcome to IELTSBank. Below are our Terms of Service, which outline the rules and regulations for the use of IELTSBank's Website.<br /><br />

                            <strong>1. Terms</strong><br />
                            By accessing this website, you are agreeing to be bound by these website Terms of Service and agree that you are responsible for compliance with any applicable local laws.<br /><br />

                            <strong>2. Use License</strong><br />
                            Permission is granted to temporarily download one copy of the materials on IELTSBank's website for personal, non-commercial transitory viewing only.<br /><br />

                            <strong>3. Disclaimer</strong><br />
                            The materials on IELTSBank's website are provided "as is". IELTSBank makes no warranties, expressed or implied, and hereby disclaims and negates all other warranties.<br /><br />

                            <strong>4. Limitations</strong><br />
                            In no event shall IELTSBank or its suppliers be liable for any damages arising out of the use or inability to use the materials on IELTSBank's website.<br /><br />

                            <strong>5. Revisions and Errata</strong><br />
                            The materials appearing on IELTSBank's website could include technical, typographical, or photographic errors. IELTSBank does not warrant that any of the materials on its website are accurate, complete, or current.<br /><br />

                            <strong>6. Site Terms of Use Modifications</strong><br />
                            IELTSBank may revise these Terms of Service for its website at any time without notice. By using this website, you are agreeing to be bound by the current version of these Terms of Service.<br /><br />

                            <strong>Last Updated:</strong> December 11, 2023<br /><br />
                            If you have any questions about these Terms of Service, please contact us.
                        </Text>
                    </Box>
                </VStack>

                <Flex display={adDisplay} width="300px" height="600px" bg="gray.200" mx={2} justifyContent="center" alignItems="center">
                    <Flex justifyContent="center" alignItems="center" width="100%" height="100%">
                        <Text>Ad Container</Text>
                    </Flex>
                </Flex>
            </Flex>
            <Footer />
        </Box>
    );
};

export default TermsOfService;
