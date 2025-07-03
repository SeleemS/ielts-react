import Link from "next/link";
import { posts } from "../../lib/posts";
import Head from "next/head";

export default function BlogIndex() {
  return (
    <>
      <Head>
        <title>IELTS Blog | IELTS Bank</title>
      </Head>
      <main className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-4xl font-bold mb-8">IELTSBank Blog</h1>
        <ul className="space-y-10">
          {posts.map((post) => (
            <li key={post.slug}>
              <Link
                href={`/blog/${post.slug}`}
                className="text-2xl font-semibold text-blue-600 hover:underline"
              >
                {post.title}
              </Link>
              <p className="text-sm text-gray-500">{post.date}</p>
              <p className="text-base text-gray-700 mt-1">{post.excerpt}</p>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
