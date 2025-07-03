import React, { useState, useEffect } from 'react';
import {
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Text,
  Box,
  Flex,
  Button,
  Spinner,
  Badge,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
} from '@chakra-ui/react';
import confetti from 'canvas-confetti';
import { app } from '../firebase';
import { useRouter } from 'next/router';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const DataTable = ({ selectedOption }) => {
  const [data, setData] = useState([]);
  const [cache, setCache] = useState({});
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const resultsPerPage = 10;
  const router = useRouter();

  const { isOpen, onOpen, onClose } = useDisclosure();
  const [hasOpenedModal, setHasOpenedModal] = useState(false);

  useEffect(() => {
    if (selectedOption === 'Writing' && !hasOpenedModal) {
      confetti({ spread: 100, particleCount: 150, origin: { y: 0.6 } });
      onOpen();
      setHasOpenedModal(true);
    }
  }, [selectedOption]);

  useEffect(() => {
    async function fetchData() {
      if (cache[selectedOption]) {
        const cachedData = cache[selectedOption];
        setData(cachedData);
        setTotalPages(Math.ceil(cachedData.length / resultsPerPage));
      } else {
        setLoading(true);
        const db = getFirestore(app);
        const collectionName = `${selectedOption.toLowerCase()}Passages`;
        const querySnapshot = await getDocs(collection(db, collectionName));
        const fetchedData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        setData(fetchedData);
        setTotalPages(Math.ceil(fetchedData.length / resultsPerPage));
        setLoading(false);

        setCache(prev => ({ ...prev, [selectedOption]: fetchedData }));
      }
    }

    fetchData();
  }, [selectedOption, cache]);

  const handleRowClick = id => {
    const routePath = `/${selectedOption.toLowerCase()}question/${id}`;
    router.push(routePath);
  };

  const getDifficultyBadge = difficulty => {
    const colorSchemes = {
      Easy: 'green',
      Medium: 'yellow',
      Hard: 'red',
      'Task 2': 'blue',
    };

    return (
      <Badge
        colorScheme={colorSchemes[difficulty] || 'gray'}
        variant="subtle"
        px={3}
        py={1}
        borderRadius="full"
        fontWeight="600"
        fontSize="xs"
      >
        {difficulty}
      </Badge>
    );
  };

  const handlePageChange = newPage => {
    setCurrentPage(newPage);
  };

  const renderPagination = () => {
    if (totalPages <= 1) return null;

    const pages = [];
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(
        <Button
          key={i}
          size="sm"
          variant={currentPage === i ? 'solid' : 'ghost'}
          colorScheme={currentPage === i ? 'blue' : 'gray'}
          onClick={() => handlePageChange(i)}
          mx={1}
        >
          {i}
        </Button>
      );
    }

    return (
      <Flex justify="center" align="center" mt={6} gap={2} mb={6}>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => handlePageChange(currentPage - 1)}
          isDisabled={currentPage === 1}
        >
          Previous
        </Button>
        {pages}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => handlePageChange(currentPage + 1)}
          isDisabled={currentPage === totalPages}
        >
          Next
        </Button>
      </Flex>
    );
  };

  return (
    <Box w="full">
      {loading ? (
        <Flex
          justifyContent="center"
          alignItems="center"
          height="400px"
          direction="column"
          bg="white"
          borderRadius="xl"
          border="1px"
          borderColor="gray.200"
        >
          <Spinner size="xl" thickness="3px" speed="0.65s" emptyColor="gray.200" color="blue.500" />
          <Text fontSize="lg" mt={4} color="gray.600" fontWeight="500">
            Loading questions...
          </Text>
        </Flex>
      ) : (
        <Box
          bg="white"
          borderRadius="xl"
          border="1px"
          borderColor="gray.200"
          overflow="hidden"
          shadow="sm"
        >
          <Box overflowX="auto">
            <Table variant="simple" size="md">
              <Thead bg="gray.50">
                <Tr>
                  <Th fontWeight="700" color="gray.700" fontSize="sm" py={4} w="80px">
                    #
                  </Th>
                  <Th fontWeight="700" color="gray.700" fontSize="sm" py={4}>
                    Title
                  </Th>
                  <Th fontWeight="700" color="gray.700" fontSize="sm" py={4} w="120px">
                    Difficulty
                  </Th>
                </Tr>
              </Thead>
              <Tbody>
                {data
                  .slice((currentPage - 1) * resultsPerPage, currentPage * resultsPerPage)
                  .map((item, index) => (
                    <Tr
                      key={item.id}
                      onClick={() => handleRowClick(item.id)}
                      cursor="pointer"
                      _hover={{
                        bg: 'blue.50',
                        transform: 'translateY(-1px)',
                        shadow: 'sm',
                      }}
                      transition="all 0.2s"
                      borderBottom="1px"
                      borderColor="gray.100"
                    >
                      <Td py={4} color="gray.600" fontWeight="500">
                        {(currentPage - 1) * resultsPerPage + index + 1}
                      </Td>
                      <Td py={4}>
                        <Text fontWeight="600" color="gray.900" fontSize="sm" noOfLines={2}>
                          {item.passageTitle}
                        </Text>
                      </Td>
                      <Td py={4}>{getDifficultyBadge(item.passageDifficulty)}</Td>
                    </Tr>
                  ))}
              </Tbody>
            </Table>
          </Box>
          {renderPagination()}
        </Box>
      )}

        <Modal isOpen={isOpen} onClose={onClose} isCentered size="lg">
        <ModalOverlay />
        <ModalContent 
            border="1px solid #CBD5E0"
            borderRadius="xl"
            boxShadow="2xl"
            px={6}
            py={4}
        >
            <ModalHeader fontWeight="700" fontSize="xl">How We Grade Writing</ModalHeader>
            <ModalCloseButton />
            <ModalBody pb={2}>
            <Text mb={3} color="gray.700" fontSize="md">
                When you practice IELTS Writing with us, your response is graded by OpenAI's GPT-4 model — the most advanced AI in the world.
            </Text>
            <Text mb={3} color="gray.700" fontSize="md">
                It evaluates your grammar, coherence, vocabulary, and task response using the official IELTS scoring criteria.
            </Text>
            <Text color="gray.700" fontSize="md">
                This makes our platform one of the most accurate, fastest, and easiest ways to improve your IELTS writing — with no human correction needed.
            </Text>
            </ModalBody>
            <Flex justify="center" py={4}>
            <Button onClick={onClose} bg="black" color="white" px={8} _hover={{ bg: 'gray.800' }}>
                Close
            </Button>
            </Flex>
        </ModalContent>
        </Modal>


    </Box>
  );
};

export default DataTable;
