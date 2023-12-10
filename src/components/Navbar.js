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
    const buttonStyle = {
        fontWeight: "bold",
        transition: "all 0.2s cubic-bezier(.08,.52,.52,1)",
        bgGradient: "linear(to-r, teal.500, green.500)",
        color: "white",
        _hover: {
            bgGradient: "linear(to-r, teal.600, green.600)",
            boxShadow: "md"
        }
    };

    return (
        <Flex as="header" bg="black" p={3} color="white" align="center"> {/* Reduced padding */}
            {/* Logo */}
            <Box p="1">
                <Image src="/image.png" alt="Logo" boxSize="50px" /> {/* Adjusted box size */}
            </Box>

            <Spacer />

            {/* Navigation Item */}
            <Button {...buttonStyle} size="md">
                Log In
            </Button>
        </Flex>
    );
}

export default Navbar;
