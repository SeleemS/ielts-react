import React, { useState, useEffect } from 'react';
import { Table, Thead, Tbody, Tr, Th, Td, Box } from '@chakra-ui/react';
import { app } from '../firebase'; // Adjust the import path as necessary
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const DataTable = () => {
    const [data, setData] = useState([]);

    useEffect(() => {
        const fetchData = async () => {
            const db = getFirestore(app);
            const querySnapshot = await getDocs(collection(db, 'readingPassages'));
            const fetchedData = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setData(fetchedData);
        };

        fetchData();
    }, []);

    return (
        <Box overflowX="auto">
            <Table variant="simple">
                <Thead>
                    <Tr>
                        <Th fontWeight="bold">#</Th>
                        <Th fontWeight="bold">Title</Th>
                        <Th fontWeight="bold">Difficulty</Th>
                    </Tr>
                </Thead>
                <Tbody>
                    {data.map((item, index) => (
                        <Tr key={item.id}>
                            <Td>{index + 1}</Td>
                            <Td>{item.passageTitle}</Td>
                            <Td>{item.passageDifficulty}</Td>
                        </Tr>
                    ))}
                </Tbody>
            </Table>
        </Box>
    );
};

export default DataTable;
