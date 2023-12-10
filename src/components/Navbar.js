import React from 'react';
import {
  Flex,
  Box,
  Spacer,
  Button,
  Image,
  HStack
} from '@chakra-ui/react';

const Navbar = () => {
    return (
        <Flex as="header" bg="black" p={4} color="white" align="center">
            {/* Logo */}
            <Box p="2">
                <Image src="/image.png" alt="Logo" boxSize="50px" />
            </Box>

            <Spacer />

            {/* Navigation Items */}
            <HStack spacing={4}>
                <Button colorScheme="teal" variant="solid" fontWeight="bold" _hover={{ bg: "teal.600" }}>
                    Problems
                </Button>
                <Button colorScheme="teal" variant="solid" fontWeight="bold" _hover={{ bg: "teal.600" }}>
                    Log In
                </Button>
            </HStack>
        </Flex>
    );
}

export default Navbar;
