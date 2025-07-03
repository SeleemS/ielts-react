import React, { useState } from 'react';
import { Flex, Button, Box } from '@chakra-ui/react';

const Toggle = ({ onChange }) => {
    const [selected, setSelected] = useState('Reading');
    const options = ['Reading', 'Writing'];

    const handleSelect = (option) => {
        setSelected(option);
        if (onChange) {
            onChange(option);
        }
    };

    return (
        <Box 
            bg="gray.50" 
            p={1} 
            borderRadius="xl" 
            border="1px" 
            borderColor="gray.200"
            maxW="400px"
            w="full"
        >
            <Flex>
                {options.map((option) => (
                    <Button
                        key={option}
                        flex={1}
                        bg={selected === option ? 'white' : 'transparent'}
                        color={selected === option ? 'gray.900' : 'gray.600'}
                        fontWeight={selected === option ? '600' : '500'}
                        borderRadius="lg"
                        border={selected === option ? '1px' : 'none'}
                        borderColor={selected === option ? 'gray.200' : 'transparent'}
                        shadow={selected === option ? 'sm' : 'none'}
                        _hover={{ 
                            bg: selected === option ? 'white' : 'gray.100',
                            color: 'gray.900'
                        }}
                        _active={{
                            transform: 'scale(0.98)'
                        }}
                        onClick={() => handleSelect(option)}
                        transition="all 0.2s"
                        size="md"
                        py={3}
                    >
                        {option}
                    </Button>
                ))}
            </Flex>
        </Box>
    );
};

export default Toggle;