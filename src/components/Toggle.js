import React, { useState } from 'react';
import { Flex, Button } from '@chakra-ui/react';

const Toggle = ({ onChange }) => {
    const [selected, setSelected] = useState('Reading');

    const options = ['Reading', 'Writing', 'Listening'];

    const handleSelect = (option) => {
        setSelected(option);
        if (onChange) {
            onChange(option);
        }
    };

    return (
        <Flex border="1px solid" borderColor="gray.200" borderRadius="md">
            {options.map((option) => (
                <Button
                    flex={1}
                    bg={selected === option ? 'blue.500' : 'white'}
                    color={selected === option ? 'white' : 'gray.600'}
                    borderRadius="none"
                    fontWeight="bold"
                    _hover={{ bg: 'blue.600', color: 'white' }}
                    onClick={() => handleSelect(option)}
                    key={option}
                >
                    {option}
                </Button>
            ))}
        </Flex>
    );
};

export default Toggle;
